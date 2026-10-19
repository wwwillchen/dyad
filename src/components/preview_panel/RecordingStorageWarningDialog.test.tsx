import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordingStorageWarningDialog } from "./RecordingStorageWarningDialog";

function renderDialog(isAppSpecificDomain: boolean) {
  render(
    <RecordingStorageWarningDialog
      open
      isAppSpecificDomain={isAppSpecificDomain}
      onOpenChange={() => {}}
      onContinue={() => {}}
    />,
  );
  return screen.getByTestId("recording-storage-warning-dialog").textContent;
}

describe("RecordingStorageWarningDialog", () => {
  it("says other apps are unaffected on an app-specific domain", () => {
    const text = renderDialog(true);
    expect(text).toContain("Other apps aren't affected.");
    expect(text).not.toContain("Other apps stay signed in.");
  });

  // Shared localhost still shares script-readable cookies, so only sign-ins
  // (namespaced HttpOnly sessions) are promised to survive.
  it("only promises other apps stay signed in on shared localhost", () => {
    const text = renderDialog(false);
    expect(text).toContain("Other apps stay signed in.");
    expect(text).not.toContain("Other apps aren't affected.");
  });
});
