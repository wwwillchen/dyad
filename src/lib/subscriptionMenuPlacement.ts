export type SubscriptionMenuPlacement = "left" | "right" | "inline";

/** Keep the entire 320px subscription panel outside the parent model menu. */
export function getSubscriptionMenuPlacement(
  menu: { left: number; right: number },
  viewportWidth: number,
): SubscriptionMenuPlacement {
  const requiredSpace = 320 + 8 + 8; // panel, gap, viewport padding
  if (viewportWidth - menu.right >= requiredSpace) return "right";
  if (menu.left >= requiredSpace) return "left";
  return "inline";
}
