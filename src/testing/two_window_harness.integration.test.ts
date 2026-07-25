import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/queryKeys";
import { TwoWindowHarness } from "./two_window_harness";
import {
  assertTrustedRenderer,
  configureTrustedRenderer,
} from "@/ipc/utils/renderer_security";

describe("two-window infrastructure harness", () => {
  it("dispatches from either window and reloads or destroys independently", () => {
    const harness = new TwoWindowHarness();
    const [first, second] = harness.createPair();
    const originalSecondWebContents = harness.webContentsId(second);

    harness.dispatchInvalidation(first, [{ family: "apps" }]);
    expect(harness.invalidatedKeys(first)).toEqual([queryKeys.apps.all]);
    expect(harness.invalidatedKeys(second)).toEqual([queryKeys.apps.all]);

    harness.reload(second);
    expect(harness.webContentsId(second)).not.toBe(originalSecondWebContents);
    harness.dispatchInvalidation(second, [{ family: "chats" }]);
    expect(harness.invalidatedKeys(first)).toEqual([
      queryKeys.apps.all,
      queryKeys.chats.all,
    ]);

    harness.destroy(first);
    expect(
      harness.registry.snapshot().map((entry) => entry.windowSessionId),
    ).toEqual([second]);
  });

  it("inspects keyed subscriptions and exercises adopt-then-remove transfer", async () => {
    const harness = new TwoWindowHarness();
    const [first, second] = harness.createPair();
    await harness.subscribe(first, { kind: "chat-chunk", chatId: 9 }, () => [
      "bootstrap",
    ]);
    expect(harness.inspectSubscriptions(first)).toEqual(["chat-chunk:9"]);

    const tab = harness.tab(first, "transferable-state");
    const removeSource = vi.fn();
    const adopt = vi.fn().mockResolvedValue({ accepted: true });
    await expect(
      harness.transferTab(tab, second, adopt, removeSource),
    ).resolves.toEqual({ status: "adopted-and-removed" });
    expect(adopt).toHaveBeenCalledWith({
      ...tab,
      ownerWindowSessionId: second,
    });
    expect(removeSource).toHaveBeenCalledWith(tab.tabInstanceId);

    removeSource.mockClear();
    adopt.mockResolvedValue({ accepted: false, reason: "destination busy" });
    await expect(
      harness.transferTab(tab, second, adopt, removeSource),
    ).resolves.toEqual({
      status: "adoption-rejected",
      reason: "destination busy",
    });
    expect(removeSource).not.toHaveBeenCalled();
  });

  it("enforces trusted-main-frame identity independently for each window", () => {
    configureTrustedRenderer({
      devServerUrl: "http://localhost:5173",
      packagedRendererUrl: "file:///app/renderer/main_window/index.html",
    });
    const harness = new TwoWindowHarness();
    const [first, second] = harness.createPair();

    expect(() =>
      assertTrustedRenderer(harness.trustedInvokeEvent(first) as any),
    ).not.toThrow();
    expect(() =>
      assertTrustedRenderer(harness.trustedInvokeEvent(second) as any),
    ).not.toThrow();
    expect(() =>
      assertTrustedRenderer(harness.trustedInvokeEvent(first, second) as any),
    ).toThrow("trusted Dyad renderer");
  });

  it("disposes deleted entities in every window and in main exactly once", () => {
    const harness = new TwoWindowHarness();
    const [first, second] = harness.createPair();
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const mainDispose = vi.fn();
    harness.windowEntityDisposals(first).onAppDeleted(firstDispose);
    harness.windowEntityDisposals(second).onAppDeleted(secondDispose);
    harness.mainEntityDisposals.onAppDeleted(mainDispose);
    harness.setVisibleEntities(second, [{ kind: "app", id: 7 }]);

    harness.deleteEntity(first, { kind: "app", id: 7 });

    expect(firstDispose).toHaveBeenCalledExactlyOnceWith(7);
    expect(secondDispose).toHaveBeenCalledExactlyOnceWith(7);
    expect(mainDispose).toHaveBeenCalledExactlyOnceWith(7);
  });
});
