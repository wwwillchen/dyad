import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordingStorageWarningDialog } from "./RecordingStorageWarningDialog";

function renderDialog(
  isAppSpecificDomain: boolean,
  isCookieIsolationEnabled?: boolean,
) {
  render(
    <RecordingStorageWarningDialog
      open
      isAppSpecificDomain={isAppSpecificDomain}
      isCookieIsolationEnabled={isCookieIsolationEnabled}
      onOpenChange={() => {}}
      onContinue={() => {}}
    />,
  );
  return screen.getByTestId("recording-storage-warning-dialog").textContent;
}

describe("RecordingStorageWarningDialog", () => {
  it.each([undefined, false, true])(
    "says other apps are unaffected on an app-specific domain with isolation %s",
    (enabled) => {
      const text = renderDialog(true, enabled);
      expect(text).toContain("Other apps aren't affected.");
      expect(text).not.toContain("stay signed in");
      expect(text).not.toContain("may also be signed out");
    },
  );

  it.each([undefined, true])(
    "preserves the HttpOnly message on shared localhost with isolation %s",
    (enabled) => {
      const text = renderDialog(false, enabled);
      expect(text).toContain(
        "Other apps that use HttpOnly cookies for sign-in stay signed in.",
      );
      expect(text).not.toContain("Other apps aren't affected.");
      expect(text).not.toContain("may also be signed out");
    },
  );

  it("warns about shared sessions when the experiment is disabled", () => {
    const text = renderDialog(false, false);
    expect(text).toContain("Other apps on localhost may also be signed out.");
    expect(text).not.toContain("Other apps aren't affected.");
    expect(text).not.toContain("stay signed in");
  });
});
