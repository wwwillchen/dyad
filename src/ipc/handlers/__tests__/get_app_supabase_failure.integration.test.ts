import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { apps } from "@/db/schema";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { registerAppHandlers } from "@/ipc/handlers/app_handlers";
import {
  setupHandlerTestHarness,
  type HandlerTestHarness,
} from "@/testing/handler_test_harness";

const mocks = vi.hoisted(() => ({
  getSupabaseProjectName: vi.fn(),
  readSettings: vi.fn(),
}));

vi.mock(
  "@/supabase_admin/supabase_management_client",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/supabase_admin/supabase_management_client")
      >();
    return {
      ...actual,
      getSupabaseProjectName: mocks.getSupabaseProjectName,
    };
  },
);

vi.mock("@/main/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/main/settings")>();
  return {
    ...actual,
    readSettings: mocks.readSettings,
  };
});

describe("get-app with unavailable Supabase metadata (integration)", () => {
  let harness: HandlerTestHarness | undefined;
  let appDirectory: string;

  beforeEach(() => {
    appDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "dyad-get-app-supabase-"),
    );
    fs.writeFileSync(path.join(appDirectory, "index.ts"), "// app");

    mocks.readSettings.mockReturnValue({
      supabase: {
        organizations: {
          "test-organization": {
            accessToken: { value: "expired-access-token" },
            refreshToken: { value: "stale-refresh-token" },
            expiresIn: 86_400,
            tokenTimestamp: 0,
          },
        },
      },
    });
    mocks.getSupabaseProjectName.mockRejectedValue(
      new DyadError(
        "Supabase token refresh failed. Error status: Not Found",
        DyadErrorKind.External,
      ),
    );

    harness = setupHandlerTestHarness();
    registerAppHandlers();
  });

  afterEach(() => {
    harness?.dispose();
    fs.rmSync(appDirectory, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("still returns the selected app when Supabase project-name enrichment fails", async () => {
    const inserted = harness!.db
      .insert(apps)
      .values({
        name: "TidyDay",
        path: appDirectory,
        supabaseProjectId: "test-project",
        supabaseOrganizationSlug: "test-organization",
      })
      .returning()
      .get();

    const app = await harness!.invokeHandler<{
      id: number;
      name: string;
      files: string[];
      supabaseProjectName: string | null;
    }>("get-app", inserted.id);

    expect(mocks.getSupabaseProjectName).toHaveBeenCalledWith(
      "test-project",
      "test-organization",
    );
    expect(app).toMatchObject({
      id: inserted.id,
      name: "TidyDay",
      files: ["index.ts"],
      supabaseProjectName: null,
    });
  });
});
