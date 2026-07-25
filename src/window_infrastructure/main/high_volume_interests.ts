import type { WindowInterest } from "../types";
import { windowInterestKey } from "../types";
import type { WindowRegistry } from "./window_registry";

interface SubscriptionState<T> {
  attaching: boolean;
  bufferedDuringAttach: T[];
}

interface PendingPayload<T> {
  interestKey: string;
  payload: T;
}

export class HighVolumeWindowInterests<T> {
  private readonly interestsByWebContents = new Map<number, Set<string>>();
  private readonly explicitSubscriptionKeys = new Set<string>();
  private readonly liveSubscriptionKeys = new Set<string>();
  private readonly subscriptionStates = new Map<string, SubscriptionState<T>>();
  private readonly pendingByDestination = new Map<
    number,
    PendingPayload<T>[]
  >();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly registry: WindowRegistry,
    private readonly channel: string,
    private readonly flushDelayMs = 100,
    private readonly deliveryMode: "batch" | "individual" = "batch",
  ) {
    registry.onUnregister((id) => this.removeWindow(id));
  }

  async attach(
    webContentsId: number,
    interest: WindowInterest,
    bootstrap: () => readonly T[] | Promise<readonly T[]>,
  ): Promise<void> {
    const key = windowInterestKey(interest);
    const stateKey = this.subscriptionKey(webContentsId, key);
    this.explicitSubscriptionKeys.add(stateKey);
    const interests =
      this.interestsByWebContents.get(webContentsId) ?? new Set<string>();
    if (interests.has(key)) {
      this.discardPending(webContentsId, key);
    }
    interests.add(key);
    this.interestsByWebContents.set(webContentsId, interests);
    const state: SubscriptionState<T> = {
      attaching: true,
      bufferedDuringAttach: [],
    };
    this.subscriptionStates.set(stateKey, state);
    try {
      const initial = await bootstrap();
      if (
        this.subscriptionStates.get(stateKey) !== state ||
        !this.interestsByWebContents.get(webContentsId)?.has(key)
      ) {
        return;
      }
      this.sendNow(webContentsId, [...initial, ...state.bufferedDuringAttach]);
      state.attaching = false;
      state.bufferedDuringAttach = [];
    } catch (error) {
      if (this.subscriptionStates.get(stateKey) === state) {
        this.subscriptionStates.delete(stateKey);
        this.explicitSubscriptionKeys.delete(stateKey);
        this.removeInterestIfUnowned(webContentsId, key);
      }
      throw error;
    }
  }

  /**
   * Installs an interest synchronously when the initiating renderer is also
   * the producer. Explicit renderer subscriptions should use attach() so
   * bootstrap closes the subscribe/delivery race.
   */
  attachLive(webContentsId: number, interest: WindowInterest): void {
    const key = windowInterestKey(interest);
    const stateKey = this.subscriptionKey(webContentsId, key);
    this.liveSubscriptionKeys.add(stateKey);
    const interests =
      this.interestsByWebContents.get(webContentsId) ?? new Set<string>();
    interests.add(key);
    this.interestsByWebContents.set(webContentsId, interests);
    if (!this.subscriptionStates.has(stateKey)) {
      this.subscriptionStates.set(stateKey, {
        attaching: false,
        bufferedDuringAttach: [],
      });
    }
  }

  detach(webContentsId: number, interest: WindowInterest): void {
    const key = windowInterestKey(interest);
    const stateKey = this.subscriptionKey(webContentsId, key);
    this.flushDestination(webContentsId);
    this.explicitSubscriptionKeys.delete(stateKey);
    if (!this.liveSubscriptionKeys.has(stateKey)) {
      this.subscriptionStates.delete(stateKey);
    }
    this.removeInterestIfUnowned(webContentsId, key);
  }

  releaseLive(webContentsId: number, interest: WindowInterest): void {
    const key = windowInterestKey(interest);
    const stateKey = this.subscriptionKey(webContentsId, key);
    this.liveSubscriptionKeys.delete(stateKey);
    if (!this.explicitSubscriptionKeys.has(stateKey)) {
      this.subscriptionStates.delete(stateKey);
    }
    this.removeInterestIfUnowned(webContentsId, key);
  }

  enqueue(interest: WindowInterest, payload: T): void {
    const key = windowInterestKey(interest);
    let scheduledDelivery = false;
    for (const [webContentsId, interests] of this.interestsByWebContents) {
      if (!interests.has(key)) continue;
      const state = this.subscriptionStates.get(
        this.subscriptionKey(webContentsId, key),
      );
      if (state?.attaching) {
        state.bufferedDuringAttach.push(payload);
        continue;
      }
      const pending = this.pendingByDestination.get(webContentsId) ?? [];
      pending.push({ interestKey: key, payload });
      this.pendingByDestination.set(webContentsId, pending);
      scheduledDelivery = true;
    }
    if (scheduledDelivery) {
      this.flushTimer ??= setTimeout(() => this.flushAll(), this.flushDelayMs);
    }
  }

  sendImmediate(
    interest: WindowInterest,
    payload: T,
    channel = this.channel,
  ): void {
    const key = windowInterestKey(interest);
    for (const [webContentsId, interests] of this.interestsByWebContents) {
      if (!interests.has(key)) continue;
      const state = this.subscriptionStates.get(
        this.subscriptionKey(webContentsId, key),
      );
      if (state?.attaching) {
        state.bufferedDuringAttach.push(payload);
        continue;
      }
      this.safeSend(webContentsId, channel, payload);
    }
  }

  terminalFlush(interest: WindowInterest, finalPayload?: T): void {
    if (finalPayload !== undefined) this.enqueue(interest, finalPayload);
    const key = windowInterestKey(interest);
    for (const [webContentsId, interests] of this.interestsByWebContents) {
      if (interests.has(key)) this.flushDestination(webContentsId);
    }
  }

  inspect(webContentsId: number): readonly string[] {
    return [...(this.interestsByWebContents.get(webContentsId) ?? [])];
  }

  flushAll(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    for (const webContentsId of this.pendingByDestination.keys()) {
      this.flushDestination(webContentsId);
    }
  }

  private flushDestination(webContentsId: number): void {
    const payloads = this.pendingByDestination.get(webContentsId);
    if (!payloads?.length) return;
    this.pendingByDestination.delete(webContentsId);
    this.sendNow(
      webContentsId,
      payloads.map(({ payload }) => payload),
    );
  }

  private discardPending(webContentsId: number, interestKey: string): void {
    const payloads = this.pendingByDestination.get(webContentsId);
    if (!payloads) return;
    const retained = payloads.filter(
      (pending) => pending.interestKey !== interestKey,
    );
    if (retained.length === 0) {
      this.pendingByDestination.delete(webContentsId);
    } else {
      this.pendingByDestination.set(webContentsId, retained);
    }
  }

  private sendNow(webContentsId: number, payloads: readonly T[]): void {
    if (payloads.length === 0) return;
    if (this.deliveryMode === "individual") {
      for (const payload of payloads) {
        this.safeSend(webContentsId, this.channel, payload);
      }
      return;
    }
    this.safeSend(webContentsId, this.channel, payloads);
  }

  private safeSend(webContentsId: number, channel: string, payload: unknown) {
    const endpoint = this.endpoint(webContentsId);
    if (!endpoint) return;
    try {
      endpoint.send(channel, payload);
    } catch (error) {
      console.error("Failed to deliver high-volume window payload", {
        webContentsId,
        channel,
        error,
      });
    }
  }

  private endpoint(webContentsId: number) {
    return this.registry
      .liveEndpoints()
      .find((candidate) => candidate.id === webContentsId);
  }

  private removeWindow(webContentsId: number): void {
    this.interestsByWebContents.delete(webContentsId);
    this.pendingByDestination.delete(webContentsId);
    for (const key of this.subscriptionStates.keys()) {
      if (key.startsWith(`${webContentsId}:`)) {
        this.subscriptionStates.delete(key);
        this.explicitSubscriptionKeys.delete(key);
        this.liveSubscriptionKeys.delete(key);
      }
    }
  }

  private removeInterestIfUnowned(
    webContentsId: number,
    interestKey: string,
  ): void {
    const stateKey = this.subscriptionKey(webContentsId, interestKey);
    if (
      this.explicitSubscriptionKeys.has(stateKey) ||
      this.liveSubscriptionKeys.has(stateKey)
    ) {
      return;
    }
    const interests = this.interestsByWebContents.get(webContentsId);
    interests?.delete(interestKey);
    if (interests?.size === 0) {
      this.interestsByWebContents.delete(webContentsId);
    }
  }

  private subscriptionKey(webContentsId: number, key: string): string {
    return `${webContentsId}:${key}`;
  }
}
