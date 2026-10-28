import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./helpers/test_helper";

// Deliberate stress repro; excluded from ordinary E2E runs.
// DYAD_REPRO_LARGE_HISTORY=1 PLAYWRIGHT_HTML_OPEN=never npm run e2e -- e2e-tests/large_history_oom.repro.spec.ts
test.skip(process.env.DYAD_REPRO_LARGE_HISTORY !== "1", "Opt-in OOM repro");
test.use({ electronConfig: { testTimeout: 300_000 } });

test("send a message after loading a very large history", async ({
  po,
  electronApp,
}) => {
  const count = Number(process.env.DYAD_REPRO_MESSAGE_COUNT ?? 1000);
  const contentBytes = Number(process.env.DYAD_REPRO_CONTENT_BYTES ?? 16384);
  const aiBytes = Number(process.env.DYAD_REPRO_AI_BYTES ?? contentBytes);
  for (const n of [count, contentBytes, aiBytes]) {
    expect(Number.isSafeInteger(n) && n > 0).toBe(true);
  }
  const artifacts = fs.mkdtempSync(
    path.join(os.tmpdir(), "dyad-large-history-"),
  );
  console.log("REPRO_ARTIFACTS", artifacts);
  console.log("REPRO_CONFIG", { count, contentBytes, aiBytes });
  for (const [name, stream] of [
    ["stdout", electronApp.process().stdout],
    ["stderr", electronApp.process().stderr],
  ] as const) {
    stream?.on("data", (data) =>
      fs.appendFileSync(path.join(artifacts, `${name}.log`), data),
    );
  }
  electronApp.process().on("exit", (code, signal) => {
    fs.writeFileSync(
      path.join(artifacts, "exit.json"),
      JSON.stringify({ code, signal }),
    );
    console.log("REPRO_EXIT", { code, signal });
  });
  po.page.on("crash", () => console.log("REPRO_RENDERER_CRASH"));
  po.page.on("pageerror", (error) =>
    fs.appendFileSync(path.join(artifacts, "renderer.log"), `${error.stack}\n`),
  );
  console.log(
    "REPRO_MAIN",
    await electronApp.evaluate(({ app }) => {
      setInterval(
        () =>
          console.log("REPRO_MEMORY", JSON.stringify(process.memoryUsage())),
        1000,
      ).unref();
      return {
        pid: process.pid,
        userData: app.getPath("userData"),
        logs: app.getPath("logs"),
        memory: process.memoryUsage(),
      };
    }),
  );

  await po.setUpDyadPro({ localAgent: true, autoApprove: true });
  await po.importApp("minimal");
  await po.chatActions.selectLocalAgentMode();
  await expect(() =>
    expect(new URL(po.page.url()).searchParams.get("id")).toBeTruthy(),
  ).toPass();
  const chatId = Number(new URL(po.page.url()).searchParams.get("id"));
  const dbPath = path.join(po.userDataDir, "sqlite.db");
  console.log("REPRO_PROFILE", po.userDataDir, "CHAT", chatId);
  // Generate history inside SQLite, avoiding a large IPC payload during setup.
  // Each assistant has a valid v6 transcript, as persisted by the agent backend.
  execFileSync("sqlite3", [dbPath], {
    input: `.timeout 10000\nBEGIN;\nDELETE FROM messages WHERE chat_id = ${chatId};
      WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < ${count})
      INSERT INTO messages (chat_id, role, content, ai_messages_json, created_at)
      SELECT ${chatId}, CASE WHEN n%2=1 THEN 'user' ELSE 'assistant' END,
        'History message ' || n || ': ' || replace(hex(zeroblob(${Math.ceil(contentBytes / 16)})), '00', 'history example '),
        CASE WHEN n%2=0 THEN json_object('sdkVersion', 'ai@v6', 'messages', json_array(json_object('role', 'assistant', 'content', replace(hex(zeroblob(${Math.ceil(aiBytes / 16)})), '00', 'history example ')))) ELSE NULL END,
        unixepoch() - ${count} + n FROM seq;
      COMMIT;
      SELECT count(*), sum(length(content)), sum(length(ai_messages_json)) FROM messages WHERE chat_id=${chatId};`,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .forEach((line) => console.log("REPRO_SEEDED", line));
  fs.writeFileSync(
    path.join(artifacts, "config.json"),
    JSON.stringify(
      {
        count,
        contentBytes,
        aiBytes,
        chatId,
        userDataDir: po.userDataDir,
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
      },
      null,
      2,
    ),
  );
  console.log("REPRO_STAGE loading history");
  await po.chatActions.clickNewChat();
  await po.page
    .getByTestId(`chat-tab-${chatId}`)
    .locator("button")
    .first()
    .click();
  await expect(po.page.getByTestId("messages-list")).toContainText(
    `History message ${count}:`,
    { timeout: 60_000 },
  );
  await expect(po.chatActions.getChatInput()).toBeVisible({ timeout: 60_000 });
  console.log(
    "REPRO_LOADED",
    await electronApp.evaluate(() => process.memoryUsage()),
  );
  console.log("REPRO_STAGE sending");
  await po.sendPrompt("tc=local-agent/simple-response reply briefly", {
    skipWaitForCompletion: true,
  });
  await po.chatActions.waitForChatCompletion({ timeout: 120_000 });
  console.log(
    "REPRO_COMPLETED",
    await electronApp.evaluate(() => process.memoryUsage()),
  );
  console.log(
    "REPRO_COUNTS",
    execFileSync(
      "sqlite3",
      [dbPath, `SELECT count(*) FROM messages WHERE chat_id=${chatId};`],
      { encoding: "utf8" },
    ).trim(),
  );
});
