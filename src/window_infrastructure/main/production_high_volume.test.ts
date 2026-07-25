import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IpcAppRuntimeOutput } from "@/ipc/services/app_runtime_transport";
import type { WindowSessionId } from "../types";
import {
  appOutputInterests,
  chatChunkInterests,
  sendChatChunk,
} from "./production_high_volume";
import { windowRegistry, type WindowEndpoint } from "./window_registry";

function endpoint(id: number): WindowEndpoint {
  return {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
  };
}

const endpointIds = [92_001, 92_002, 92_003];

describe("production high-volume fan-out", () => {
  afterEach(() => {
    for (const id of endpointIds) windowRegistry.unregister(id);
  });

  it("routes app output and chat chunks only to keyed interests", async () => {
    const producer = endpoint(endpointIds[0]);
    const interested = endpoint(endpointIds[1]);
    const unrelated = endpoint(endpointIds[2]);
    windowRegistry.register(producer, randomUUID() as WindowSessionId);
    windowRegistry.register(interested, randomUUID() as WindowSessionId);
    windowRegistry.register(unrelated, randomUUID() as WindowSessionId);
    await appOutputInterests.attach(
      interested.id,
      { kind: "app-output", appId: 7 },
      () => [],
    );
    await chatChunkInterests.attach(
      interested.id,
      { kind: "chat-chunk", chatId: 9 },
      () => [],
    );

    new IpcAppRuntimeOutput(producer as unknown as WebContents).send({
      type: "stdout",
      message: "first line",
      appId: 7,
    });
    sendChatChunk(producer as unknown as WebContents, {
      chatId: 9,
      streamingPreview: { content: "<dyad-write>partial" },
    });

    expect(producer.send).toHaveBeenCalledWith(
      "app:output",
      expect.objectContaining({ appId: 7, message: "first line" }),
    );
    expect(interested.send).toHaveBeenCalledWith(
      "app:output",
      expect.objectContaining({ appId: 7, message: "first line" }),
    );
    expect(interested.send).toHaveBeenCalledWith(
      "chat:response:chunk",
      expect.objectContaining({ chatId: 9 }),
    );
    expect(unrelated.send).not.toHaveBeenCalled();
  });
});
