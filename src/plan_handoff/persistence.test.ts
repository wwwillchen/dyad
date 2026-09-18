// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const config = vi.hoisted(() => ({ directory: "" }));
vi.mock("@/paths/paths", () => ({ getUserDataPath: () => config.directory }));
import { hydratePlanHandoff, persistPlanHandoff } from "./persistence";
import { transitionPlanHandoffHost } from "./host_transition";
import type { PlanHandoffHostState } from "./host_state";
beforeEach(async () => {
  config.directory = await mkdtemp(path.join(tmpdir(), "dyad-plan-recovery-"));
});
afterEach(async () => {
  await rm(config.directory, { recursive: true, force: true });
});
const state: PlanHandoffHostState = {
  phase: "submitting",
  targetChatId: 2,
  failure: null,
  intent: {
    schemaVersion: 1,
    handoffId: "h",
    sourceChatId: 1,
    appId: 3,
    acceptInNewChat: true,
    planId: "chat-1",
    planHash: "version",
    planVersion: "version",
    plan: { title: "Plan", content: "Do work" },
  },
};

it("recovers accepted or queued implementation without dispatching it twice", () => {
  persistPlanHandoff(1, state);
  const admitted = vi.fn(() => true);
  const restored = hydratePlanHandoff(1, admitted);
  expect(admitted).toHaveBeenCalledWith("h:implementation");
  expect(restored.phase).toBe("started");
  const duplicate = transitionPlanHandoffHost(restored, {
    type: "ACCEPT",
    intent: { ...state.intent!, handoffId: "different-click" },
  });
  expect(duplicate.kind).toBe("ignored");
});

it("requires renewed human acceptance for a process-dead handoff that never admitted implementation", () => {
  persistPlanHandoff(1, { ...state, phase: "accepted" });
  const restored = hydratePlanHandoff(1, () => false);
  expect(restored).toMatchObject({
    phase: "failed",
    failure: expect.stringContaining("interrupted by restart"),
  });
  expect(transitionPlanHandoffHost(restored, { type: "RESUME" }).kind).toBe(
    "ignored",
  );
  expect(
    transitionPlanHandoffHost(restored, {
      type: "ACCEPT",
      intent: { ...state.intent!, handoffId: "new-human-acceptance" },
    }).kind,
  ).toBe("applied");
});
