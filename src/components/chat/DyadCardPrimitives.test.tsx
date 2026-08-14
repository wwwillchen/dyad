import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DyadCard, DyadStateIndicator } from "./DyadCardPrimitives";

describe("DyadCard", () => {
  it("lifts the card surface on hover in dark mode", () => {
    render(<DyadCard data-testid="card">Content</DyadCard>);

    const card = screen.getByTestId("card");
    expect(card.className).toContain("dark:bg-(--background-lighter)");
    expect(card.className).toContain("dark:hover:bg-muted/50");
  });
});

describe("DyadStateIndicator", () => {
  it("renders warning state with an amber indicator", () => {
    const { container } = render(
      <DyadStateIndicator state="warning" warningLabel="Needs attention" />,
    );

    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(container.querySelector(".text-amber-600")).toBeTruthy();
  });
});
