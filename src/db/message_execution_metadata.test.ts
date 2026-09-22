import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { expect, it } from "vitest";

it("drops prototype message metadata without losing chat identity, models or historical cards", () => {
  const sqlite = new Database(":memory:");
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const removal = migrations.findIndex((migration) =>
      migration.sql.some((sql) =>
        sql.includes("DROP COLUMN `execution_usage`"),
      ),
    );
    expect(removal).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, removal)) {
      for (const sql of migration.sql) sqlite.exec(sql);
    }
    sqlite
      .prepare("INSERT INTO apps (name, path) VALUES (?, ?)")
      .run("fixture", "/tmp/fixture");
    sqlite
      .prepare(
        "INSERT INTO chats (app_id, execution_backend, claude_session_id) VALUES (1, ?, ?)",
      )
      .run("claude-code", "session");
    const content =
      '<dyad-claude-tool name="Read">historical card</dyad-claude-tool>';
    sqlite
      .prepare(
        "INSERT INTO messages (chat_id, role, content, model, execution_backend, execution_usage) VALUES (1, 'assistant', ?, ?, ?, ?)",
      )
      .run(
        content,
        "claude-resolved",
        "claude-code",
        '{"status":"attempted","models":[]}',
      );
    for (const migration of migrations.slice(removal)) {
      for (const sql of migration.sql) sqlite.exec(sql);
    }
    const columns = sqlite.pragma("table_info(messages)") as { name: string }[];
    expect(columns.map((column) => column.name)).not.toContain(
      "execution_backend",
    );
    expect(columns.map((column) => column.name)).not.toContain(
      "execution_usage",
    );
    expect(
      sqlite
        .prepare("SELECT execution_backend, claude_session_id FROM chats")
        .get(),
    ).toEqual({
      execution_backend: "claude-code",
      claude_session_id: "session",
    });
    expect(sqlite.prepare("SELECT content, model FROM messages").get()).toEqual(
      { content, model: "claude-resolved" },
    );
  } finally {
    sqlite.close();
  }
});
