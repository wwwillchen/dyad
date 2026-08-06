import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearLegacyWindowSessionPersistence,
  restorableVisibleEntity,
} from "./window_session";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("window sessions", () => {
  it("prefers the selected chat when tracking a visible route", () => {
    expect(
      restorableVisibleEntity([
        { kind: "app", id: 7 },
        { kind: "chat", id: 11 },
      ]),
    ).toEqual({ kind: "chat", id: 11 });
    expect(restorableVisibleEntity([{ kind: "app", id: 7 }])).toEqual({
      kind: "app",
      id: 7,
    });
  });

  it("clears durable and temporary legacy window session files", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dyad-windows-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "window-sessions.json");
    fs.writeFileSync(filePath, "durable", "utf8");
    fs.writeFileSync(`${filePath}.tmp`, "temporary", "utf8");

    await clearLegacyWindowSessionPersistence(directory);

    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });
});
