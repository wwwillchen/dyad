import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewCookieIsolationSwitch } from "./PreviewCookieIsolationSwitch";

const mocks = vi.hoisted(() => ({
  settings: undefined as Record<string, unknown> | undefined,
  settingsLoading: true,
  updateSettings: vi.fn(),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => mocks,
}));

describe("PreviewCookieIsolationSwitch", () => {
  beforeEach(() => {
    mocks.settings = undefined;
    mocks.settingsLoading = true;
    mocks.updateSettings.mockReset().mockResolvedValue(undefined);
  });

  it("shows loading without presenting an unconfirmed setting", () => {
    render(<PreviewCookieIsolationSwitch />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading setting…");
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("shows a load failure without presenting the default as a saved value", () => {
    mocks.settingsLoading = false;
    render(<PreviewCookieIsolationSwitch />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Unable to load setting",
    );
  });

  it.each([undefined, false, true])(
    "shows and toggles preference %s, defaulting to on",
    (enabled) => {
      mocks.settings = { enablePreviewCookieIsolation: enabled };
      render(<PreviewCookieIsolationSwitch />);
      const toggle = screen.getByRole("switch", {
        name: "Isolate preview sign-in cookies",
      });
      expect(toggle.getAttribute("aria-checked")).toBe(String(enabled ?? true));
      fireEvent.click(toggle);
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        enablePreviewCookieIsolation: !(enabled ?? true),
      });
    },
  );
});
