import { isDyadProEnabled, type UserSettings } from "@/lib/schemas";

/** Use the resolved turn mode, not the user's default mode, for chat requests. */
export function shouldBillChatGPTSubscription(settings: UserSettings): boolean {
  return (
    isDyadProEnabled(settings) &&
    settings.selectedChatMode !== "build" &&
    settings.selectedChatMode !== "ask" &&
    settings.selectedChatMode !== "plan"
  );
}
