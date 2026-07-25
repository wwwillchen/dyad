import type { WebContents } from "electron";

import type { AppOutput } from "@/ipc/types/misc";
import type { AppRuntimeOutput } from "@/ipc/types/app_runtime";
import {
  appOutputInterests,
  ensureProducerInterest,
} from "@/window_infrastructure/main/production_high_volume";

const outputsBySender = new WeakMap<WebContents, IpcAppRuntimeOutput>();

/**
 * Temporary IPC adapter for the transport-neutral app-runtime service.
 *
 * The future main-hosted actor can provide its own output sink without
 * importing Electron or knowing which renderer initiated the command.
 */
export class IpcAppRuntimeOutput implements AppRuntimeOutput {
  constructor(private readonly sender: WebContents) {}

  send(output: AppOutput): void {
    const interest = { kind: "app-output" as const, appId: output.appId };
    ensureProducerInterest(this.sender, interest);
    appOutputInterests.sendImmediate(interest, output, "app:output");
    if (output.type === "app-exit") {
      appOutputInterests.releaseLive(this.sender.id, interest);
    }
  }

  enqueue(output: AppOutput): void {
    const interest = { kind: "app-output" as const, appId: output.appId };
    ensureProducerInterest(this.sender, interest);
    appOutputInterests.enqueue(interest, output);
  }

  flush(): void {
    appOutputInterests.flushAll();
  }
}

export function getIpcAppRuntimeOutput(
  sender: WebContents,
): IpcAppRuntimeOutput {
  let output = outputsBySender.get(sender);
  if (!output) {
    output = new IpcAppRuntimeOutput(sender);
    outputsBySender.set(sender, output);
  }
  return output;
}
