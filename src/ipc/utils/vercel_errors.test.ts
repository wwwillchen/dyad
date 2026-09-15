import { describe, expect, it } from "vitest";
import { ResponseValidationError } from "@vercel/sdk/models/responsevalidationerror.js";
import { SDKError } from "@vercel/sdk/models/sdkerror.js";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";
import { getVercelProjectCreationError } from "./vercel_errors";

describe("getVercelProjectCreationError", () => {
  it.each([200, 400, 403, 500])(
    "explains an unreadable HTTP %s response without exposing project secrets",
    (status) => {
      const body = JSON.stringify({ secret: "private-environment-value" });
      const error = new ResponseValidationError("Response validation failed", {
        response: new Response(body, { status }),
        request: new Request("https://api.vercel.com/v10/projects"),
        body,
        cause: undefined,
        rawValue: JSON.parse(body),
        rawMessage: "Response validation failed",
      });

      const result = getVercelProjectCreationError(error);

      expect(result).toBeInstanceOf(DyadError);
      expect(result).toHaveProperty("kind", DyadErrorKind.External);
      expect(result.message).toContain("couldn't read Vercel's response");
      expect(result.message).toContain(`HTTP ${status}`);
      if (status === 200) {
        expect(result.message).toContain("may already have been created");
        expect(result.message).toContain('"Connect to existing project"');
      } else {
        expect(result.message).not.toContain("may already have been created");
      }
      expect(result.message).not.toContain("private-");
      expect(result.message).not.toContain("Response validation failed");
    },
  );

  it.each(["body", "rawValue"])(
    "shows Vercel's actual error message from %s",
    (source) => {
      const payload = {
        error: {
          code: "forbidden",
          message:
            "You must install the GitHub integration before creating a project.",
        },
        secret: "private-environment-value",
      };
      const error = new ResponseValidationError("Response validation failed", {
        response: new Response(null, { status: 403 }),
        request: new Request("https://api.vercel.com/v10/projects"),
        body: source === "body" ? JSON.stringify(payload) : "not JSON",
        rawValue: source === "rawValue" ? payload : undefined,
        rawMessage: "Response validation failed",
        cause: new Error("SDK schema mismatch"),
      });

      expect(getVercelProjectCreationError(error).message).toBe(
        `Vercel project setup failed (HTTP 403): ${payload.error.message}`,
      );
    },
  );

  it("shows the validation cause when a successful response fails SDK validation", () => {
    const error = new ResponseValidationError("Response validation failed", {
      response: new Response(null, { status: 200 }),
      request: new Request("https://api.vercel.com/v10/projects"),
      body: JSON.stringify({ secret: "private-environment-value" }),
      rawValue: {},
      rawMessage: "Response validation failed",
      cause: new Error("Invalid value for framework: expected a string"),
    });

    const message = getVercelProjectCreationError(error).message;
    expect(message).toContain(
      "Vercel project setup failed (HTTP 200): Invalid value for framework: expected a string",
    );
    expect(message).toContain("may already have been created");
    expect(message).toContain('"Connect to existing project"');
  });

  it.each([400, 403, 409, 500])(
    "extracts normal HTTP %s API errors without displaying the SDK's raw body",
    (status) => {
      const body = JSON.stringify({
        error: { message: "The project could not be created." },
        secret: "private-environment-value",
      });
      const error = new SDKError("API error occurred", {
        response: new Response(body, { status }),
        request: new Request("https://api.vercel.com/v10/projects"),
        body,
      });

      expect(getVercelProjectCreationError(error).message).toBe(
        `Vercel project setup failed (HTTP ${status}): The project could not be created.`,
      );
    },
  );

  it("keeps the HTTP status when a normal API error has a non-JSON body", () => {
    const error = new SDKError("API error occurred", {
      response: new Response(null, { status: 502 }),
      request: new Request("https://api.vercel.com/v10/projects"),
      body: "<html>private-proxy-details</html>",
    });
    const message = getVercelProjectCreationError(error).message;
    expect(message).toContain("HTTP 502");
    expect(message).not.toContain("private-proxy-details");
  });

  it("preserves other errors and their classifications", () => {
    for (const error of [
      new Error("Project name is already in use."),
      new DyadError("Not authenticated with Vercel.", DyadErrorKind.Auth),
    ]) {
      expect(getVercelProjectCreationError(error)).toBe(error);
    }
  });

  it("provides a fallback for unknown failures", () => {
    expect(getVercelProjectCreationError(null).message).toBe(
      "Failed to create Vercel project.",
    );
  });
});
