import { ResponseValidationError } from "@vercel/sdk/models/responsevalidationerror.js";
import { VercelError } from "@vercel/sdk/models/vercelerror.js";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

function getResponseErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("error" in value) {
    const nested = value.error;
    if (
      nested &&
      typeof nested === "object" &&
      "message" in nested &&
      typeof nested.message === "string" &&
      nested.message.trim()
    ) {
      return nested.message.trim();
    }
  }
  if ("message" in value && typeof value.message === "string") {
    return value.message.trim() || undefined;
  }
  return undefined;
}

export function getVercelProjectCreationError(error: unknown): Error {
  if (error instanceof VercelError) {
    // Surface the API's error message, not the entire project response (which
    // can include environment variables). Keep provider wording for diagnosis.
    // Telemetry for vercel:create-project reports only a fixed classification.
    let detail: string | undefined;
    if (error.body.length <= 100_000) {
      try {
        detail = getResponseErrorMessage(JSON.parse(error.body));
      } catch {
        // Non-JSON responses may still have the SDK's validation cause below.
      }
    }
    if (error instanceof ResponseValidationError) {
      detail ??= getResponseErrorMessage(error.rawValue);
      detail ??= getResponseErrorMessage(error.cause);
    }
    const fallback =
      error instanceof ResponseValidationError
        ? "Dyad couldn't read Vercel's response while setting up your project."
        : "Vercel rejected the project setup request without an error message.";
    const recovery =
      error.statusCode >= 200 && error.statusCode < 300
        ? ' The project may already have been created. Check your Vercel dashboard; if it exists, choose "Connect to existing project" in the Publish panel before retrying.'
        : "";

    return new DyadError(
      `Vercel project setup failed (HTTP ${error.statusCode}): ${(detail || fallback).slice(0, 4000)}${recovery}`,
      DyadErrorKind.External,
    );
  }

  return error instanceof Error
    ? error
    : new Error("Failed to create Vercel project.");
}
