import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewCookieIsolationSwitch } from "./PreviewCookieIsolationSwitch";

const mocks = vi.hoisted(() => ({
  settings: undefined as Record<string, unknown> | undefined,
  updateSettings: vi.fn(),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => mocks,
}));

describe("PreviewCookieIsolationSwitch", () => {
  beforeEach(() => {
    mocks.settings = undefined;
    mocks.updateSettings.mockReset().mockResolvedValue(undefined);
  });

  it("waits for settings before allowing changes", () => {
    render(<PreviewCookieIsolationSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(mocks.updateSettings).not.toHaveBeenCalled();
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
