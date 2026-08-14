import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("sub-agent startup recovery", () => {
  it("runs only after the database has initialized", () => {
    const mainSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/main.ts"),
      "utf8",
    );
    const handlerSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/pro/main/ipc/handlers/local_agent/agent_tool_handlers.ts",
      ),
      "utf8",
    );

    expect(mainSource.indexOf("initializeDatabase();")).toBeGreaterThan(-1);
    expect(mainSource.indexOf("recoverInterruptedSubagents()")).toBeGreaterThan(
      mainSource.indexOf("initializeDatabase();"),
    );
    expect(handlerSource).not.toContain("recoverInterruptedSubagents");
  });
});
