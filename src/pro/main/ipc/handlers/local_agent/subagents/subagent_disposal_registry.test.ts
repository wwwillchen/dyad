import { describe, expect, it, vi } from "vitest";

import { SubagentDisposalRegistry } from "./subagent_disposal_registry";

describe("SubagentDisposalRegistry", () => {
  it("closes admission synchronously and reopens only after release", async () => {
    const registry = new SubagentDisposalRegistry();
    const disposal = registry.beginDisposal(7);

    expect(() => registry.assertAdmissionOpen(7)).toThrow(
      "Chat is temporarily unavailable",
    );
    await expect(registry.withAdmission(7, async () => "late")).rejects.toThrow(
      "Chat is temporarily unavailable",
    );

    disposal.release();
    await expect(
      registry.withAdmission(7, async () => "allowed"),
    ).resolves.toBe("allowed");
  });

  it("drains admitted construction before deletion continues", async () => {
    const registry = new SubagentDisposalRegistry();
    let finishAdmission!: () => void;
    let markAdmissionEntered!: () => void;
    const admissionEntered = new Promise<void>((resolve) => {
      markAdmissionEntered = resolve;
    });
    const admitted = registry.withAdmission(
      9,
      () =>
        new Promise<void>((resolve) => {
          finishAdmission = resolve;
          markAdmissionEntered();
        }),
    );
    await admissionEntered;

    const disposal = registry.beginDisposal(9);
    const drained = vi.fn();
    const drain = disposal.drainAdmissions().then(drained);
    await Promise.resolve();
    expect(drained).not.toHaveBeenCalled();

    finishAdmission();
    await admitted;
    await drain;
    expect(drained).toHaveBeenCalledOnce();
    disposal.release();
  });

  it("waits for every active run owned before the fence", async () => {
    const registry = new SubagentDisposalRegistry();
    let finishRun!: () => void;
    const run = registry.trackActiveRun(
      11,
      new Promise<void>((resolve) => {
        finishRun = resolve;
      }),
    );
    const disposal = registry.beginDisposal(11);
    const settled = vi.fn();
    const wait = disposal.waitForActiveRuns().then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    finishRun();
    await run;
    await wait;
    expect(settled).toHaveBeenCalledOnce();
    disposal.release();
  });

  it("globally blocks admission while a reset owns the registry", async () => {
    const registry = new SubagentDisposalRegistry();
    const reset = registry.beginReset();
    await reset.drainAdmissions();

    await expect(
      registry.withAdmission(13, async () => "late"),
    ).rejects.toThrow("Chat is temporarily unavailable");

    reset.release();
    await expect(
      registry.withAdmission(13, async () => "allowed"),
    ).resolves.toBe("allowed");
  });
});
