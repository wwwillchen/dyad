import { describe, expect, it } from "vitest";
import { VersionPreviewOperationOutcomeSchema } from "./operations";

describe("VersionPreviewOperationOutcomeSchema", () => {
  it("accepts serialized failures and rejects Error instances", () => {
    expect(
      VersionPreviewOperationOutcomeSchema.safeParse({
        kind: "failed",
        operation: "restore",
        error: { message: "Git checkout failed" },
      }).success,
    ).toBe(true);

    expect(
      VersionPreviewOperationOutcomeSchema.safeParse({
        kind: "failed",
        operation: "restore",
        error: new Error("Git checkout failed"),
      }).success,
    ).toBe(false);
  });
});
