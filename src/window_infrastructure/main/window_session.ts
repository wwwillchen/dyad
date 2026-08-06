import fs from "node:fs";
import path from "node:path";
import type {
  VisibleEntity,
  WindowSessionId,
} from "@/window_infrastructure/types";

export const MAX_PRODUCT_WINDOWS = 8;
const LEGACY_WINDOW_SESSION_FILE_NAME = "window-sessions.json";

export interface WindowSessionDescriptor {
  windowSessionId: WindowSessionId;
  visibleEntity?: VisibleEntity;
}

export function restorableVisibleEntity(
  entities: readonly VisibleEntity[],
): VisibleEntity | undefined {
  return (
    entities.find((entity) => entity.kind === "chat") ??
    entities.find((entity) => entity.kind === "app")
  );
}

export async function clearLegacyWindowSessionPersistence(
  userDataPath: string,
): Promise<void> {
  const filePath = path.join(userDataPath, LEGACY_WINDOW_SESSION_FILE_NAME);
  await Promise.all([
    fs.promises.rm(filePath, { force: true }),
    fs.promises.rm(`${filePath}.tmp`, { force: true }),
  ]);
}
