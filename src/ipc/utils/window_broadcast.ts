import type { WebContents } from "electron";
import {
  windowRegistry,
  type WindowEndpoint,
} from "@/window_infrastructure/main/window_registry";
import { safeSend } from "./safe_sender";

function isWindowEndpoint(value: unknown): value is WindowEndpoint {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger((value as Partial<WindowEndpoint>).id) &&
    typeof (value as Partial<WindowEndpoint>).isDestroyed === "function" &&
    typeof (value as Partial<WindowEndpoint>).send === "function"
  );
}

export function broadcastToRegisteredWindows(
  origin: WebContents | null | undefined,
  channel: string,
  payload: unknown,
): void {
  if (!isWindowEndpoint(origin)) {
    safeSend(origin, channel, payload);
    return;
  }
  windowRegistry.ensureRegistered(origin);
  for (const endpoint of windowRegistry.liveEndpoints()) {
    safeSend(endpoint as WebContents, channel, payload);
  }
}
