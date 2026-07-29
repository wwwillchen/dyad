export type KeyedAdmissionPhase = "open" | "draining" | "sealed" | "committed";

/**
 * Opaque admission identity captured before an asynchronous authorization
 * boundary. Callers may retain it, but only the owning gate can validate it.
 */
export interface KeyedAdmissionGeneration {
  readonly ordinal: number;
  readonly identity: object;
}

export class KeyedAdmissionGateError extends Error {
  constructor(
    readonly code:
      | "create-blocked"
      | "dispatch-blocked"
      | "stale-generation"
      | "fence-active"
      | "gate-disposed"
      | "invalid-fence-transition",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "KeyedAdmissionGateError";
  }
}

export interface FenceHandle<Key> {
  readonly key: Key;
  readonly generation: KeyedAdmissionGeneration;
  seal(): Promise<void>;
  commit(): boolean;
  abort(options?: { readonly requestResync?: () => void }): boolean;
  release(): boolean;
}

interface TrackedContinuation {
  readonly settled: Promise<unknown>;
}

interface FenceRecord<Event> {
  readonly generation: KeyedAdmissionGeneration;
  readonly previousGeneration: KeyedAdmissionGeneration;
  readonly allowDuringDrain: (event: Event) => boolean;
  readonly tracked: Set<TrackedContinuation>;
  phase: Exclude<KeyedAdmissionPhase, "open">;
  sealing?: Promise<void>;
  sealCancellation?: {
    readonly promise: Promise<void>;
    readonly cancel: () => void;
  };
  sealFailure?: KeyedAdmissionGateError;
}

interface KeyEntry<Event> {
  generation: KeyedAdmissionGeneration;
  readonly active: Set<TrackedContinuation>;
  fence?: FenceRecord<Event>;
}

/**
 * A generation-aware, two-phase admission fence for one semantic key space.
 *
 * The gate deliberately owns only admission state. Actor ownership and
 * disposal remain with ActorHost.
 */
export class KeyedAdmissionGate<Key, Event> {
  private readonly entries = new Map<Key, KeyEntry<Event>>();
  private nextGeneration = 1;
  private readonly defaultGeneration = this.createGeneration();
  private disposed = false;

  captureGeneration(key: Key): KeyedAdmissionGeneration {
    this.assertOpen();
    return this.entries.get(key)?.generation ?? this.defaultGeneration;
  }

  isGenerationCurrent(key: Key, generation: KeyedAdmissionGeneration): boolean {
    if (this.disposed) return false;
    return this.captureGeneration(key) === generation;
  }

  beginFence(options: {
    readonly key: Key;
    readonly allowDuringDrain: (event: Event) => boolean;
  }): FenceHandle<Key> {
    this.assertOpen();
    const entry = this.entry(options.key);
    if (entry.fence) {
      throw new KeyedAdmissionGateError(
        "fence-active",
        "A fence is already active for this key",
      );
    }

    const record: FenceRecord<Event> = {
      generation: this.createGeneration(),
      previousGeneration: entry.generation,
      allowDuringDrain: options.allowDuringDrain,
      tracked: new Set(entry.active),
      phase: "draining",
    };
    // This assignment is the fence publication linearization point. It occurs
    // before a handle is returned and therefore before the caller can await.
    entry.generation = record.generation;
    entry.fence = record;

    return {
      key: options.key,
      generation: record.generation,
      seal: () => this.seal(options.key, record),
      commit: () => this.commit(options.key, record),
      abort: (abortOptions) =>
        this.abort(options.key, record, abortOptions?.requestResync),
      release: () => this.release(options.key, record),
    };
  }

  assertCreateAllowed(
    key: Key,
    generation: KeyedAdmissionGeneration = this.captureGeneration(key),
  ): void {
    this.assertOpen();
    const entry = this.entries.get(key);
    this.assertCurrentGeneration(entry, generation);
    if (entry?.fence) {
      throw new KeyedAdmissionGateError(
        "create-blocked",
        `Creation is blocked while the key is ${entry.fence.phase}`,
      );
    }
  }

  assertDispatchAllowed(
    key: Key,
    event: Event,
    generation: KeyedAdmissionGeneration = this.captureGeneration(key),
  ): void {
    this.assertOpen();
    const entry = this.entries.get(key);
    this.assertCurrentGeneration(entry, generation);
    const fence = entry?.fence;
    if (
      fence?.phase === "draining" &&
      this.isAllowedDuringDrain(fence, event)
    ) {
      this.assertFenceStillDraining(key, fence);
      this.assertCurrentGeneration(this.entries.get(key), generation);
      return;
    }
    this.throwDispatchBlocked(fence);
  }

  /**
   * Revalidates a producer sink captured for an already-admitted continuation.
   * A pre-fence generation may emit only explicitly declared drain events and
   * only until sealing publishes.
   */
  assertCapturedDispatchAllowed(
    key: Key,
    event: Event,
    generation: KeyedAdmissionGeneration,
  ): void {
    this.assertOpen();
    const entry = this.entries.get(key);
    const fence = entry?.fence;
    if (
      fence?.phase === "draining" &&
      generation === fence.previousGeneration
    ) {
      if (!this.isAllowedDuringDrain(fence, event)) {
        throw new KeyedAdmissionGateError(
          "dispatch-blocked",
          "The captured producer event is not allowed while draining",
        );
      }
      this.assertFenceStillDraining(key, fence);
      return;
    }
    this.assertCurrentGeneration(entry, generation);
    this.assertDispatchAllowed(key, event, generation);
  }

  track<Result>(key: Key, start: () => Promise<Result>): Promise<Result> {
    return this.trackCaptured(key, this.captureGeneration(key), start);
  }

  trackCaptured<Result>(
    key: Key,
    generation: KeyedAdmissionGeneration,
    start: () => Promise<Result>,
  ): Promise<Result> {
    this.assertOpen();
    const entry = this.entry(key);
    const fence = entry.fence;
    const admitted =
      generation === entry.generation ||
      (fence?.phase === "draining" && generation === fence.previousGeneration);
    if (
      !admitted ||
      fence?.phase === "sealed" ||
      fence?.phase === "committed"
    ) {
      throw new KeyedAdmissionGateError(
        generation === entry.generation
          ? "dispatch-blocked"
          : "stale-generation",
        "The continuation generation is no longer admitted",
      );
    }

    let resolveTracked!: (value: Result) => void;
    let rejectTracked!: (failure: unknown) => void;
    const settled = new Promise<Result>((resolve, reject) => {
      resolveTracked = resolve;
      rejectTracked = reject;
    });
    const continuation: TrackedContinuation = { settled };
    entry.active.add(continuation);
    if (fence) fence.tracked.add(continuation);

    let started: Promise<Result>;
    try {
      started = start();
    } catch (failure) {
      started = Promise.reject(failure);
    }
    void started.then(resolveTracked, rejectTracked);
    const cleanup = () => {
      entry.active.delete(continuation);
      fence?.tracked.delete(continuation);
      entry.fence?.tracked.delete(continuation);
      if (
        entry.active.size === 0 &&
        !entry.fence &&
        entry.generation === this.defaultGeneration &&
        this.entries.get(key) === entry
      ) {
        this.entries.delete(key);
      }
    };
    void settled.then(cleanup, cleanup);
    return settled;
  }

  inspect(key: Key): {
    readonly phase: KeyedAdmissionPhase;
    readonly generation: KeyedAdmissionGeneration;
    readonly trackedContinuations: number;
  } {
    const entry = this.entries.get(key);
    return {
      phase: entry?.fence?.phase ?? "open",
      generation: entry?.generation ?? this.defaultGeneration,
      trackedContinuations: entry?.active.size ?? 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.active.clear();
      const fence = entry.fence;
      if (fence) {
        fence.tracked.clear();
        fence.sealFailure = new KeyedAdmissionGateError(
          "gate-disposed",
          "The admission gate was disposed while the fence was sealing",
        );
        fence.sealCancellation?.cancel();
      }
    }
    this.entries.clear();
  }

  inspectEntryCount(): number {
    return this.entries.size;
  }

  private seal(key: Key, record: FenceRecord<Event>): Promise<void> {
    const entry = this.entries.get(key);
    if (entry?.fence !== record) return Promise.resolve();
    if (record.phase === "committed") {
      throw new KeyedAdmissionGateError(
        "invalid-fence-transition",
        "A committed fence cannot be sealed again",
      );
    }
    if (record.phase === "sealed") return Promise.resolve();
    if (!record.sealing) {
      let cancel!: () => void;
      const promise = new Promise<void>((resolve) => {
        cancel = resolve;
      });
      record.sealCancellation = { promise, cancel };
      record.sealing = this.finishSeal(key, record);
    }
    return record.sealing;
  }

  private async finishSeal(
    key: Key,
    record: FenceRecord<Event>,
  ): Promise<void> {
    // Remain draining while enrolled cleanup produces its required terminal
    // events. Each loop includes work synchronously enrolled by the previous
    // continuation before publishing the sealed linearization point.
    while (record.tracked.size > 0) {
      await Promise.race([
        Promise.allSettled(
          [...record.tracked].map((continuation) => continuation.settled),
        ),
        record.sealCancellation?.promise,
      ]);
      if (record.sealFailure) throw record.sealFailure;
    }
    if (record.sealFailure) throw record.sealFailure;
    const entry = this.entries.get(key);
    if (entry?.fence === record && record.phase === "draining") {
      record.phase = "sealed";
    }
  }

  private commit(key: Key, record: FenceRecord<Event>): boolean {
    const entry = this.entries.get(key);
    if (entry?.fence !== record) return false;
    if (record.phase !== "sealed" || record.tracked.size !== 0) {
      throw new KeyedAdmissionGateError(
        "invalid-fence-transition",
        "A fence must finish sealing before it can commit",
      );
    }
    record.phase = "committed";
    return true;
  }

  private abort(
    key: Key,
    record: FenceRecord<Event>,
    requestResync?: () => void,
  ): boolean {
    const entry = this.entries.get(key);
    if (entry?.fence !== record) return false;
    if (record.phase === "committed") {
      throw new KeyedAdmissionGateError(
        "invalid-fence-transition",
        "A committed fence cannot abort",
      );
    }
    if (record.phase === "draining" && record.sealing) {
      throw new KeyedAdmissionGateError(
        "invalid-fence-transition",
        "A fence cannot abort while sealing is in progress",
      );
    }
    entry.fence = undefined;
    entry.generation = this.createGeneration();
    requestResync?.();
    return true;
  }

  private release(key: Key, record: FenceRecord<Event>): boolean {
    const entry = this.entries.get(key);
    if (entry?.fence !== record) return false;
    if (record.phase !== "committed") {
      throw new KeyedAdmissionGateError(
        "invalid-fence-transition",
        "Only a committed fence can be released",
      );
    }
    entry.fence = undefined;
    entry.generation = this.createGeneration();
    return true;
  }

  private entry(key: Key): KeyEntry<Event> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        generation: this.defaultGeneration,
        active: new Set(),
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private assertOpen(): void {
    if (!this.disposed) return;
    throw new KeyedAdmissionGateError(
      "gate-disposed",
      "The keyed admission gate is disposed",
    );
  }

  private createGeneration(): KeyedAdmissionGeneration {
    return Object.freeze({
      ordinal: this.nextGeneration++,
      identity: Object.freeze({}),
    });
  }

  private assertCurrentGeneration(
    entry: KeyEntry<Event> | undefined,
    generation: KeyedAdmissionGeneration,
  ): void {
    if ((entry?.generation ?? this.defaultGeneration) === generation) return;
    throw new KeyedAdmissionGateError(
      "stale-generation",
      "The keyed admission generation changed",
    );
  }

  private throwDispatchBlocked(fence: FenceRecord<Event> | undefined): void {
    if (!fence) return;
    throw new KeyedAdmissionGateError(
      "dispatch-blocked",
      `Dispatch is blocked while the key is ${fence.phase}`,
    );
  }

  private assertFenceStillDraining(key: Key, fence: FenceRecord<Event>): void {
    if (this.entries.get(key)?.fence === fence && fence.phase === "draining") {
      return;
    }
    throw new KeyedAdmissionGateError(
      "stale-generation",
      "The keyed admission fence changed during drain admission",
    );
  }

  private isAllowedDuringDrain(
    fence: FenceRecord<Event>,
    event: Event,
  ): boolean {
    try {
      return fence.allowDuringDrain(event);
    } catch (cause) {
      throw new KeyedAdmissionGateError(
        "dispatch-blocked",
        "The drain admission policy failed",
        { cause },
      );
    }
  }
}
