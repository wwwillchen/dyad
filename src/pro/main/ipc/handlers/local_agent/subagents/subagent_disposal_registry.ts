import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { withLock } from "@/ipc/utils/lock_utils";

interface SubagentChatDisposal {
  drainAdmissions(): Promise<void>;
  waitForActiveRuns(): Promise<void>;
  release(): void;
}

/**
 * Main-owned lifetime fence for memory-backed sub-agent work.
 *
 * Deletion closes admission synchronously, then drains callbacks admitted
 * before the fence and active runner promises before the owning chat row can
 * disappear through a direct or parent cascade deletion.
 */
export class SubagentDisposalRegistry {
  private readonly disposalCounts = new Map<number, number>();
  private readonly activeRuns = new Map<number, Set<Promise<void>>>();
  private resetCount = 0;

  withAdmission<Result>(
    chatId: number,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    return withLock("subagent-global-admission", () =>
      withLock(this.admissionKey(chatId), async () => {
        this.assertAdmissionOpen(chatId);
        return operation();
      }),
    );
  }

  assertAdmissionOpen(chatId: number): void {
    if (!this.isDisposing(chatId) && this.resetCount === 0) return;
    throw new DyadError(
      "Chat is temporarily unavailable",
      DyadErrorKind.Precondition,
    );
  }

  isDisposing(chatId: number): boolean {
    return this.disposalCounts.has(chatId);
  }

  isAdmissionClosed(chatId: number): boolean {
    return this.isDisposing(chatId) || this.resetCount > 0;
  }

  trackActiveRun(chatId: number, run: Promise<void>): Promise<void> {
    let runs = this.activeRuns.get(chatId);
    if (!runs) {
      runs = new Set();
      this.activeRuns.set(chatId, runs);
    }
    const tracked = run.finally(() => {
      const current = this.activeRuns.get(chatId);
      current?.delete(tracked);
      if (current?.size === 0) this.activeRuns.delete(chatId);
    });
    runs.add(tracked);
    return tracked;
  }

  beginDisposal(chatId: number): SubagentChatDisposal {
    this.disposalCounts.set(chatId, (this.disposalCounts.get(chatId) ?? 0) + 1);
    let released = false;
    return {
      drainAdmissions: () =>
        withLock(this.admissionKey(chatId), async () => undefined),
      waitForActiveRuns: async () => {
        while (true) {
          const active = [...(this.activeRuns.get(chatId) ?? [])];
          if (active.length === 0) return;
          await Promise.allSettled(active);
        }
      },
      release: () => {
        if (released) return;
        released = true;
        const next = (this.disposalCounts.get(chatId) ?? 1) - 1;
        if (next === 0) this.disposalCounts.delete(chatId);
        else this.disposalCounts.set(chatId, next);
      },
    };
  }

  beginReset(): Pick<SubagentChatDisposal, "drainAdmissions" | "release"> {
    this.resetCount += 1;
    let released = false;
    return {
      drainAdmissions: () =>
        withLock("subagent-global-admission", async () => undefined),
      release: () => {
        if (released) return;
        released = true;
        this.resetCount -= 1;
      },
    };
  }

  private admissionKey(chatId: number): string {
    return `subagent-chat-admission:${chatId}`;
  }
}

export const subagentDisposalRegistry = new SubagentDisposalRegistry();
