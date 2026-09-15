import { ResponseValidationError } from "@vercel/sdk/models/responsevalidationerror.js";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

function getResponseErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("error" in value) {
    const nested = getResponseErrorMessage(value.error);
    if (nested) return nested;
  }
  if ("message" in value && typeof value.message === "string") {
    return value.message.trim() || undefined;
  }
  return undefined;
}

export function getVercelProjectCreationError(error: unknown): Error {
  if (error instanceof ResponseValidationError) {
    // Surface the API's error message, not the entire project response (which
    // can include environment variables). Keep provider wording for diagnosis.
    let detail: string | undefined;
    if (error.body.length <= 100_000) {
      try {
        detail = getResponseErrorMessage(JSON.parse(error.body));
      } catch {
        // Non-JSON responses still have the SDK's validation cause below.
      }
    }
    detail ??= getResponseErrorMessage(error.rawValue);
    detail ??= getResponseErrorMessage(error.cause);
    if (detail) {
      return new DyadError(
        `Vercel project setup failed (HTTP ${error.statusCode}): ${detail.slice(0, 4000)}`,
        DyadErrorKind.External,
      );
    }

    return new DyadError(
      "Dyad couldn't read Vercel's response while setting up your project. " +
        "The project may already have been created. Check your Vercel dashboard; " +
        'if it exists, choose "Connect to existing project" in the Publish panel. ' +
        "If it doesn't exist, try again. If this keeps happening, update Dyad or create the project in Vercel and connect it here.",
      DyadErrorKind.External,
    );
  }

  return error instanceof Error
    ? error
    : new Error("Failed to create Vercel project.");
}
