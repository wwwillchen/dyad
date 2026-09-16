import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxedE2eTestsSwitch } from "./SandboxedE2eTestsSwitch";

const mocks = vi.hoisted(() => ({
  settings: {} as { enableSandboxE2eTests?: boolean } | undefined,
  updateSettings: vi.fn(),
}));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => mocks }));

describe("SandboxedE2eTestsSwitch", () => {
  beforeEach(() => {
    mocks.settings = {};
    mocks.updateSettings.mockClear();
  });

  it("displays the default without persisting it, then saves an explicit opt-in", () => {
    render(<SandboxedE2eTestsSwitch />);
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      enableSandboxE2eTests: true,
    });
  });

  it("saves an explicit opt-out", () => {
    mocks.settings = { enableSandboxE2eTests: true };
    render(<SandboxedE2eTestsSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      enableSandboxE2eTests: false,
    });
  });
});
