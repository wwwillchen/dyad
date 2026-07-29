import { z } from "zod";
import {
  OperationRegistry,
  type OperationDisposalCause,
} from "@/distributed_machines/operation_registry";
import type { CorrelatedOperationOutcome } from "@/distributed_machines/operation_registry";
import { DyadErrorKind } from "@/errors/dyad_error";
import type { VersionPreviewInvocationRef } from "./transport";

export type VersionPreviewOperationKind =
  | "close"
  | "switch-app"
  | "select-version"
  | "switch-branch"
  | "restore"
  | "restore-to-message"
  | "retry-return";

export type VersionPreviewCancellationReason =
  | "superseded"
  | "actor-disposed"
  | "app-disposed"
  | "machine-disposed"
  | "host-disposed"
  | "window-disposed";

export type VersionPreviewOperationOutcome =
  | {
      readonly kind: "succeeded";
      readonly operation: VersionPreviewOperationKind;
      readonly cleanupStarted?: boolean;
    }
  | {
      readonly kind: "failed";
      readonly operation: VersionPreviewOperationKind;
      readonly error: {
        readonly message: string;
        readonly kind?: DyadErrorKind;
      };
    }
  | {
      readonly kind: "cancelled";
      readonly reason: VersionPreviewCancellationReason;
    };

export type VersionPreviewCorrelatedOutcome = CorrelatedOperationOutcome<
  VersionPreviewOperationOutcome,
  VersionPreviewInvocationRef
>;

const versionPreviewFailureSchema = z.preprocess(
  (value) => (value instanceof Error ? undefined : value),
  z
    .object({
      message: z.string(),
      kind: z.enum(DyadErrorKind).optional(),
    })
    .strict(),
);

export const VersionPreviewOperationOutcomeSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("succeeded"),
        operation: z.enum([
          "close",
          "switch-app",
          "select-version",
          "switch-branch",
          "restore",
          "restore-to-message",
          "retry-return",
        ]),
        cleanupStarted: z.boolean().optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("failed"),
        operation: z.enum([
          "close",
          "switch-app",
          "select-version",
          "switch-branch",
          "restore",
          "restore-to-message",
          "retry-return",
        ]),
        error: versionPreviewFailureSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("cancelled"),
        reason: z.enum([
          "superseded",
          "actor-disposed",
          "app-disposed",
          "machine-disposed",
          "host-disposed",
          "window-disposed",
        ]),
      })
      .strict(),
  ],
);

function disposalReason(
  cause: OperationDisposalCause,
): VersionPreviewCancellationReason {
  switch (cause) {
    case "actor":
      return "actor-disposed";
    case "key":
      return "app-disposed";
    case "machine":
      return "machine-disposed";
    case "host":
      return "host-disposed";
    case "window-session":
      return "window-disposed";
  }
}

export const versionPreviewOperationRegistry = new OperationRegistry<
  VersionPreviewOperationOutcome,
  VersionPreviewInvocationRef
>({
  maxUnresolved: 256,
  maxSettledReplay: 128,
  now: Date.now,
  disposalOutcome: (cause) => ({
    kind: "cancelled",
    reason: disposalReason(cause),
  }),
  supersededOutcome: () => ({
    kind: "cancelled",
    reason: "superseded",
  }),
  enqueueFailureOutcome: (error) => ({
    kind: "failed",
    operation: "select-version",
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  }),
});
