import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SystemResourceUsageSwitch } from "./SystemResourceUsageSwitch";

const { preferences, updateSettings } = vi.hoisted(() => ({
  preferences: { showSystemResourceUsage: undefined as boolean | undefined },
  updateSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ settings: preferences, updateSettings }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  preferences.showSystemResourceUsage = undefined;
});

it("defaults on for existing users and saves both toggle choices", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<SystemResourceUsageSwitch />);
  const toggle = screen.getByRole("switch");
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await user.click(toggle);
  expect(updateSettings).toHaveBeenLastCalledWith({
    showSystemResourceUsage: false,
  });
  preferences.showSystemResourceUsage = false;
  rerender(<SystemResourceUsageSwitch />);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  await user.click(toggle);
  expect(updateSettings).toHaveBeenLastCalledWith({
    showSystemResourceUsage: true,
  });
});
