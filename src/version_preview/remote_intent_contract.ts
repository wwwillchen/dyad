import {
  DEFAULT_REMOTE_INTENT_ENVELOPE_BYTES,
  DEFAULT_REMOTE_SNAPSHOT_ENVELOPE_BYTES,
  PROTOCOL_V1_REFUSAL_MAP,
  defineRemoteIntentContract,
} from "@/distributed_machines/remote_intent_contract";
import {
  VersionPreviewIntentEventSchema,
  VersionPreviewKeySchema,
  VersionPreviewRemoteSnapshotSchema,
  type VersionPreviewIntentEvent,
  type VersionPreviewKey,
  type VersionPreviewRemoteSnapshot,
  type VersionPreviewWireEvent,
} from "./transport";

const admissionOnly = {
  completion: "admission-only",
  observedRevision: { kind: "actor", required: true },
  retry: { kind: "none" },
  acceptance: "admission",
  inputDisposition: "preserve",
} as const;

/**
 * Declarative policy for the protocol-v1 version-preview boundary. Completion
 * remains projected through the actor's operation-correlated settlement state;
 * the remote transport itself acknowledges admission only.
 */
export const versionPreviewRemoteIntentContract = defineRemoteIntentContract<
  VersionPreviewKey,
  VersionPreviewIntentEvent,
  VersionPreviewWireEvent,
  VersionPreviewRemoteSnapshot
>({
  keyCodec: VersionPreviewKeySchema,
  encodeKey: (key) => key,
  rendererIntentCodec: VersionPreviewIntentEventSchema,
  snapshotCodec: VersionPreviewRemoteSnapshotSchema,
  toTrustedEvent: ({ intent }) => Object.freeze(structuredClone(intent)),
  authorization: { subscribe: "required", dispatch: "required" },
  keyIntentRelationship: { kind: "entity-relative" },
  intents: {
    CLOSE: admissionOnly,
    APP_CHANGED: admissionOnly,
    SELECT_VERSION: admissionOnly,
    SWITCH_BRANCH: admissionOnly,
    RESTORE: admissionOnly,
    RESTORE_TO_MESSAGE: admissionOnly,
    RETRY_RETURN: admissionOnly,
    ACCEPT_CURRENT_REPOSITORY: admissionOnly,
    CHECKPOINT_AND_ACCEPT_CURRENT_REPOSITORY: admissionOnly,
    SHOW_RECOVERY_NOTICE: admissionOnly,
  },
  refusalMap: PROTOCOL_V1_REFUSAL_MAP,
  budgets: {
    intentBytes: DEFAULT_REMOTE_INTENT_ENVELOPE_BYTES,
    snapshotBytes: DEFAULT_REMOTE_SNAPSHOT_ENVELOPE_BYTES,
  },
});
