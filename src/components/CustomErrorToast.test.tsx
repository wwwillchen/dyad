import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomErrorToast } from "./CustomErrorToast";

const { dismiss } = vi.hoisted(() => ({
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { dismiss },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactElement }) => render,
  TooltipContent: () => null,
}));

describe("CustomErrorToast", () => {
  beforeEach(() => {
    dismiss.mockClear();
  });

  it("makes long error details keyboard-scrollable", () => {
    const message = `Build failed\n${"A very long error line ".repeat(40)}`;

    render(<CustomErrorToast message={message} toastId="error-toast" />);

    const details = screen.getByRole("region", { name: "Error details" });
    expect(details.getAttribute("tabindex")).toBe("0");
    expect(details.classList.contains("overflow-y-auto")).toBe(true);
    expect(details.classList.contains("overscroll-contain")).toBe(true);
    expect(details.textContent).toContain(message);
  });

  it("keeps copy and close controls accessible", () => {
    const onCopy = vi.fn();

    render(
      <CustomErrorToast
        message="Something went wrong"
        toastId="error-toast"
        onCopy={onCopy}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));
    expect(onCopy).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Close error" }));
    expect(dismiss).toHaveBeenCalledWith("error-toast");
  });
});
