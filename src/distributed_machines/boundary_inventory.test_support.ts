export const distributedDefinitionInventory = [
  "app_run/definition.ts::appRunDefinition",
  "chat_stream/definition.ts::chatStreamDefinition",
  "ipc/services/github_ops_definition.ts::githubOpsDefinition",
  "ipc/services/image_generation_definition.ts::imageGenerationDefinition",
  "ipc/services/version_preview_definition.ts::versionPreviewDefinition",
  "plan_handoff/definition.ts::planHandoffDefinition",
] as const;

export const unsafeEscapeHatchInventory = {
  wideningCasts: [
    "chat_stream/definition.ts::chatStreamDefinition.remote.eventCodec",
    "ipc/services/github_ops_definition.ts::githubOpsDefinition.remote.eventCodec",
    "ipc/services/version_preview_definition.ts::versionPreviewDefinition.remote.eventCodec",
    "plan_handoff/definition.ts::planHandoffDefinition.remote.eventCodec",
  ],
  rawDispatchOrEnqueue: [
    "chat_stream/remote_manager.ts::ChatStreamRemoteManager.dispatchCompatibilityCommand::call(this.actor().dispatch)",
    "chat_stream/remote_manager.ts::ChatStreamRemoteManager.dispatchQueueEvent::call(actor.dispatch)",
    "chat_stream/remote_manager.ts::ChatStreamRemoteManager.prepareAndDispatchSubmission::call(actor.dispatch)",
    "github_ops/useGithubOps.ts::useGithubOps.dispatch::access(remote.dispatch)",
    "github_ops/useGithubOps.ts::useGithubOps.dispatch::call(remote.dispatch)",
    "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionCancelled::access(remote.dispatch)",
    "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionCancelled::call(remote.dispatch)",
    "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionStarted::access(remote.dispatch)",
    "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionStarted::call(remote.dispatch)",
    "hooks/useVersionPreview.ts::useVersionPreview.dispatchNow::call(actor.dispatch)",
    "ipc/services/plan_handoff_service.ts::startPlanHandoffFromMain::call(actor.enqueue)",
    "plan_handoff/remote_manager.ts::PlanHandoffRemoteManager.accept::call(actor.dispatch)",
    "version_preview/VersionPreviewProvider.tsx::VersionPreviewProvider.subscribeSelected.inspect.action.onClick::call(actor.dispatch)",
  ],
  bespokeWaiters: ["hooks/useVersionPreview.ts::useVersionPreview.dispatchNow"],
  subscriptionRefCounts: [
    "chat_stream/remote_manager.ts::ChatStreamRemoteManager.subscriptions",
    "user_input/read_model.ts::getUserInputReadModel.readModel.start.subscriptions",
  ],
  deletionResetFences: [
    "ipc/services/app_chat_creation_fence.ts::assertAppChatCreationOpen::uses(creationBlockCounts)",
    "ipc/services/app_chat_creation_fence.ts::beginAppChatMutation::uses(creationBlockCounts)",
    "ipc/services/app_chat_creation_fence.ts::creationBlockCounts",
    "ipc/services/chat_actor_deletion_fence.ts::admissionBlockCounts",
    "ipc/services/chat_actor_deletion_fence.ts::assertChatActorAdmissionOpen::uses(admissionBlockCounts)",
    "ipc/services/chat_actor_deletion_fence.ts::beginChatActorMutation::uses(admissionBlockCounts)",
    "ipc/services/github_ops_service.ts::GithubOpsService.assertAcceptingOperations::uses(deletionFences)",
    "ipc/services/github_ops_service.ts::GithubOpsService.assertAcceptingOperations::uses(resetFenceCount)",
    "ipc/services/github_ops_service.ts::GithubOpsService.beginAppDeletion::uses(deletionFences)",
    "ipc/services/github_ops_service.ts::GithubOpsService.beginReset::uses(resetFenceCount)",
    "ipc/services/github_ops_service.ts::GithubOpsService.deletionFences",
    "ipc/services/github_ops_service.ts::GithubOpsService.endAppDeletion::uses(deletionFences)",
    "ipc/services/github_ops_service.ts::GithubOpsService.endReset::uses(resetFenceCount)",
    "ipc/services/github_ops_service.ts::GithubOpsService.resetFenceCount",
    "ipc/services/version_preview_service.ts::VersionPreviewService.assertAcceptingOperations::uses(deletionFences)",
    "ipc/services/version_preview_service.ts::VersionPreviewService.assertAcceptingOperations::uses(resetFenceCount)",
    "ipc/services/version_preview_service.ts::VersionPreviewService.beginAppDeletion::uses(deletionFences)",
    "ipc/services/version_preview_service.ts::VersionPreviewService.beginReset::uses(resetFenceCount)",
    "ipc/services/version_preview_service.ts::VersionPreviewService.deletionFences",
    "ipc/services/version_preview_service.ts::VersionPreviewService.endAppDeletion::uses(deletionFences)",
    "ipc/services/version_preview_service.ts::VersionPreviewService.endReset::uses(resetFenceCount)",
    "ipc/services/version_preview_service.ts::VersionPreviewService.resetFenceCount",
  ],
  initiatorRoutingMaps: [
    "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.forget::uses(initiatorByOperationId)",
    "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.initiatorByOperationId",
    "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.recordInitiator::uses(initiatorByOperationId)",
    "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.showError::uses(initiatorByOperationId)",
    "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.confirm::uses(initiatorByOperationId)",
    "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.forget::uses(initiatorByOperationId)",
    "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.initiatorByOperationId",
    "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.originEndpointFor::uses(initiatorByOperationId)",
    "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.recordInitiator::uses(initiatorByOperationId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.acquire::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.acquireIfUnowned::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.clearAll::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.clearApp::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.inspect::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.isLastOwner::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.release::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.removeWindow::uses(windowIdsByAppId)",
    "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.windowIdsByAppId",
  ],
} as const;

/**
 * Framework-owned ingress and accounting. These are the primitives that make
 * raw lifecycle capabilities unavailable to ordinary domain callers, not
 * compatibility escape hatches.
 */
export const frameworkOwnedBoundaryInventory = {
  rawDispatchOrEnqueue: [
    "distributed_machines/actor_host.ts::HostedActor.activate::call(this.enqueue)",
    "distributed_machines/actor_host.ts::HostedActor.constructor.context.send::call(this.enqueue)",
    "distributed_machines/actor_host.ts::HostedActor.enqueueExpected::call(this.enqueue)",
    "distributed_machines/actor_host.ts::HostedActor.enqueueWithAdmission.ticket::call(this.dispatcher.enqueue)",
    "distributed_machines/actor_host.ts::HostedActor.send::call(this.enqueue)",
    "distributed_machines/ipc_connection.ts::IpcRemoteMachineConnection.dispatch::call(ipc.distributedMachine.dispatch)",
    "distributed_machines/react.ts::useDistributedMachine::access(actor.dispatch)",
    "distributed_machines/remote_client.ts::RemoteMachineClient.dispatch::call(this.connection.dispatch)",
    "distributed_machines/remote_client.ts::RemoteSnapshotStore.dispatch::call(this.client.dispatch)",
    "ipc/handlers/distributed_machine_handlers.ts::registerDistributedMachineHandlers::access(distributedMachineContracts.dispatch)",
    "ipc/handlers/distributed_machine_handlers.ts::registerDistributedMachineHandlers::call(transport.dispatch)",
  ],
  subscriptionRefCounts: [
    "distributed_machines/actor_host.ts::HostedActor.reconcileRetention::uses(subscriberCount)",
    "distributed_machines/actor_host.ts::HostedActor.scheduleIdleEviction::uses(subscriberCount)",
    "distributed_machines/actor_host.ts::HostedActor.subscribe::uses(subscriberCount)",
    "distributed_machines/actor_host.ts::HostedActor.subscriberCount",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.beginPendingSubscription::uses(referencesPerWindow)",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.completeSubscription::uses(referencesPerWindow)",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.decrementWindowReferences::uses(referencesPerWindow)",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.dispose::uses(referencesPerWindow)",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.inspectSubscriptions::uses(totalReferences)",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.referencesPerWindow",
    "distributed_machines/remote_transport.ts::RemoteMachineTransport.subscriptions",
    "state_machines/snapshot_store.ts::SnapshotStore.subscriberCount",
  ],
} as const;

/**
 * Narrow, audited adapters owned by the two migrated pilots. These calls sit
 * behind actor.request()/PreparedRequest or destructive domain façades and are
 * deliberately excluded from the unsafe compatibility inventory.
 */
export const migratedSurfaceBoundaryInventory = {
  wideningCasts: [
    "app_run/definition.ts::appRunDefinition.remote.eventCodec",
    "ipc/services/image_generation_definition.ts::imageGenerationDefinition.remote.eventCodec",
  ],
  rawDispatchOrEnqueue: [
    "app_run/definition.ts::createCommandRunner::call(output.enqueue)",
    "image_generation/hooks.ts::useImageGenerationRequestActor.cancellationActor.dispatchRequest::call(actor.dispatch)",
    "image_generation/hooks.ts::useImageGenerationRequestActor.completionAware.dispatchRequest::call(actor.dispatch)",
    "ipc/services/image_generation_actor_service.ts::ImageGenerationActorService.finishAppDeletion::call(fence.actor.enqueue)",
    "ipc/services/image_generation_actor_service.ts::ImageGenerationActorService.prepareAppDeletion::call(fence.actor.enqueue)",
  ],
  deletionResetFences: [
    "ipc/services/image_generation_service.ts::ImageGenerationService.assertAcceptingGenerations::uses(deletionFences)",
    "ipc/services/image_generation_service.ts::ImageGenerationService.assertAcceptingGenerations::uses(resetFenceCount)",
    "ipc/services/image_generation_service.ts::ImageGenerationService.beginAppDeletion::uses(deletionFences)",
    "ipc/services/image_generation_service.ts::ImageGenerationService.beginReset::uses(resetFenceCount)",
    "ipc/services/image_generation_service.ts::ImageGenerationService.deletionFences",
    "ipc/services/image_generation_service.ts::ImageGenerationService.endAppDeletion::uses(deletionFences)",
    "ipc/services/image_generation_service.ts::ImageGenerationService.endReset::uses(resetFenceCount)",
    "ipc/services/image_generation_service.ts::ImageGenerationService.resetFenceCount",
  ],
  initiatorRoutingMaps: [
    "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.clear::uses(initiatorByJobId)",
    "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.forgetApp::uses(initiatorByJobId)",
    "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.initiatorByJobId",
    "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.present::uses(initiatorByJobId)",
    "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.recordInitiator::uses(initiatorByJobId)",
    "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.routeForJob::uses(initiatorByJobId)",
  ],
} as const;

export interface CompatibilityBoundaryEntry {
  readonly machine: string;
  readonly exactFile: string;
  readonly mechanism: keyof typeof unsafeEscapeHatchInventory;
  readonly boundaries: readonly string[];
  readonly why: string;
  readonly removalOwner: string;
}

/**
 * Exact compatibility ownership. Tests flatten these entries and exact-match
 * the semantic source inventory, so additions, deletions, and renames require
 * an explicit review-visible update.
 */
export const compatibilityBoundaryInventory = [
  {
    machine: "chat_stream",
    exactFile: "chat_stream/definition.ts",
    mechanism: "wideningCasts",
    boundaries: [
      "chat_stream/definition.ts::chatStreamDefinition.remote.eventCodec",
    ],
    why: "The protocol-v1 codec still widens renderer intents to trusted events.",
    removalOwner: "Conditional follow-up A — remaining remote definitions",
  },
  {
    machine: "chat_stream",
    exactFile: "chat_stream/remote_manager.ts",
    mechanism: "rawDispatchOrEnqueue",
    boundaries: [
      "chat_stream/remote_manager.ts::ChatStreamRemoteManager.dispatchCompatibilityCommand::call(this.actor().dispatch)",
      "chat_stream/remote_manager.ts::ChatStreamRemoteManager.dispatchQueueEvent::call(actor.dispatch)",
      "chat_stream/remote_manager.ts::ChatStreamRemoteManager.prepareAndDispatchSubmission::call(actor.dispatch)",
    ],
    why: "Chat keeps its pre-MVP owned queue and remote-manager adapter.",
    removalOwner: "Conditional follow-up C — chat/plan owned queue",
  },
  {
    machine: "chat_stream",
    exactFile: "chat_stream/remote_manager.ts",
    mechanism: "subscriptionRefCounts",
    boundaries: [
      "chat_stream/remote_manager.ts::ChatStreamRemoteManager.subscriptions",
    ],
    why: "Chat subscription ownership has not migrated to leases.",
    removalOwner: "Conditional follow-up A — remaining remote definitions",
  },
  {
    machine: "github_ops",
    exactFile: "ipc/services/github_ops_definition.ts",
    mechanism: "wideningCasts",
    boundaries: [
      "ipc/services/github_ops_definition.ts::githubOpsDefinition.remote.eventCodec",
    ],
    why: "The protocol-v1 codec still widens renderer intents to trusted events.",
    removalOwner: "Conditional follow-up A — GitHub operations",
  },
  {
    machine: "github_ops",
    exactFile: "github_ops/useGithubOps.ts",
    mechanism: "rawDispatchOrEnqueue",
    boundaries: [
      "github_ops/useGithubOps.ts::useGithubOps.dispatch::access(remote.dispatch)",
      "github_ops/useGithubOps.ts::useGithubOps.dispatch::call(remote.dispatch)",
      "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionCancelled::access(remote.dispatch)",
      "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionCancelled::call(remote.dispatch)",
      "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionStarted::access(remote.dispatch)",
      "github_ops/useGithubOps.ts::useGithubOps.dispatchConflictResolutionStarted::call(remote.dispatch)",
    ],
    why: "GitHub operations were explicitly excluded from the MVP pilots.",
    removalOwner: "Conditional follow-up A — GitHub operations",
  },
  {
    machine: "version_preview",
    exactFile: "ipc/services/version_preview_definition.ts",
    mechanism: "wideningCasts",
    boundaries: [
      "ipc/services/version_preview_definition.ts::versionPreviewDefinition.remote.eventCodec",
    ],
    why: "The protocol-v1 codec still widens renderer intents to trusted events.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
  {
    machine: "version_preview",
    exactFile: "hooks/useVersionPreview.ts",
    mechanism: "bespokeWaiters",
    boundaries: ["hooks/useVersionPreview.ts::useVersionPreview.dispatchNow"],
    why: "Version preview still owns its protocol-v1 settlement waiters.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
  {
    machine: "version_preview",
    exactFile: "hooks/useVersionPreview.ts",
    mechanism: "rawDispatchOrEnqueue",
    boundaries: [
      "hooks/useVersionPreview.ts::useVersionPreview.dispatchNow::call(actor.dispatch)",
    ],
    why: "Version preview still uses its protocol-v1 dispatch façade.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
  {
    machine: "version_preview",
    exactFile: "version_preview/VersionPreviewProvider.tsx",
    mechanism: "rawDispatchOrEnqueue",
    boundaries: [
      "version_preview/VersionPreviewProvider.tsx::VersionPreviewProvider.subscribeSelected.inspect.action.onClick::call(actor.dispatch)",
    ],
    why: "Version preview presentation still emits a raw compatibility intent.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
  {
    machine: "plan_handoff",
    exactFile: "plan_handoff/definition.ts",
    mechanism: "wideningCasts",
    boundaries: [
      "plan_handoff/definition.ts::planHandoffDefinition.remote.eventCodec",
    ],
    why: "The protocol-v1 codec still widens renderer intents to trusted events.",
    removalOwner: "Conditional follow-up B/C — plan handoff",
  },
  {
    machine: "plan_handoff",
    exactFile: "plan_handoff/remote_manager.ts",
    mechanism: "rawDispatchOrEnqueue",
    boundaries: [
      "plan_handoff/remote_manager.ts::PlanHandoffRemoteManager.accept::call(actor.dispatch)",
    ],
    why: "Plan handoff was excluded until durable checkpoint work.",
    removalOwner: "Conditional follow-up B/C — plan handoff",
  },
  {
    machine: "plan_handoff",
    exactFile: "ipc/services/plan_handoff_service.ts",
    mechanism: "rawDispatchOrEnqueue",
    boundaries: [
      "ipc/services/plan_handoff_service.ts::startPlanHandoffFromMain::call(actor.enqueue)",
    ],
    why: "Main-owned plan handoff still uses protocol-v1 actor enqueue.",
    removalOwner: "Conditional follow-up B/C — plan handoff",
  },
  {
    machine: "user_input",
    exactFile: "user_input/read_model.ts",
    mechanism: "subscriptionRefCounts",
    boundaries: [
      "user_input/read_model.ts::getUserInputReadModel.readModel.start.subscriptions",
    ],
    why: "User-input queue ownership is outside the MVP.",
    removalOwner: "Conditional follow-up C — chat/plan owned queue",
  },
  {
    machine: "app_chat_creation",
    exactFile: "ipc/services/app_chat_creation_fence.ts",
    mechanism: "deletionResetFences",
    boundaries: [
      "ipc/services/app_chat_creation_fence.ts::assertAppChatCreationOpen::uses(creationBlockCounts)",
      "ipc/services/app_chat_creation_fence.ts::beginAppChatMutation::uses(creationBlockCounts)",
      "ipc/services/app_chat_creation_fence.ts::creationBlockCounts",
    ],
    why: "Chat creation has not migrated to keyed admission.",
    removalOwner: "Conditional follow-up C — chat/plan owned queue",
  },
  {
    machine: "chat_stream",
    exactFile: "ipc/services/chat_actor_deletion_fence.ts",
    mechanism: "deletionResetFences",
    boundaries: [
      "ipc/services/chat_actor_deletion_fence.ts::admissionBlockCounts",
      "ipc/services/chat_actor_deletion_fence.ts::assertChatActorAdmissionOpen::uses(admissionBlockCounts)",
      "ipc/services/chat_actor_deletion_fence.ts::beginChatActorMutation::uses(admissionBlockCounts)",
    ],
    why: "Chat deletion has not migrated to keyed admission.",
    removalOwner: "Conditional follow-up C — chat/plan owned queue",
  },
  {
    machine: "github_ops",
    exactFile: "ipc/services/github_ops_service.ts",
    mechanism: "deletionResetFences",
    boundaries: [
      "ipc/services/github_ops_service.ts::GithubOpsService.assertAcceptingOperations::uses(deletionFences)",
      "ipc/services/github_ops_service.ts::GithubOpsService.assertAcceptingOperations::uses(resetFenceCount)",
      "ipc/services/github_ops_service.ts::GithubOpsService.beginAppDeletion::uses(deletionFences)",
      "ipc/services/github_ops_service.ts::GithubOpsService.beginReset::uses(resetFenceCount)",
      "ipc/services/github_ops_service.ts::GithubOpsService.deletionFences",
      "ipc/services/github_ops_service.ts::GithubOpsService.endAppDeletion::uses(deletionFences)",
      "ipc/services/github_ops_service.ts::GithubOpsService.endReset::uses(resetFenceCount)",
      "ipc/services/github_ops_service.ts::GithubOpsService.resetFenceCount",
    ],
    why: "GitHub operations retain domain-owned deletion/reset counters.",
    removalOwner: "Conditional follow-up A — GitHub operations",
  },
  {
    machine: "version_preview",
    exactFile: "ipc/services/version_preview_service.ts",
    mechanism: "deletionResetFences",
    boundaries: [
      "ipc/services/version_preview_service.ts::VersionPreviewService.assertAcceptingOperations::uses(deletionFences)",
      "ipc/services/version_preview_service.ts::VersionPreviewService.assertAcceptingOperations::uses(resetFenceCount)",
      "ipc/services/version_preview_service.ts::VersionPreviewService.beginAppDeletion::uses(deletionFences)",
      "ipc/services/version_preview_service.ts::VersionPreviewService.beginReset::uses(resetFenceCount)",
      "ipc/services/version_preview_service.ts::VersionPreviewService.deletionFences",
      "ipc/services/version_preview_service.ts::VersionPreviewService.endAppDeletion::uses(deletionFences)",
      "ipc/services/version_preview_service.ts::VersionPreviewService.endReset::uses(resetFenceCount)",
      "ipc/services/version_preview_service.ts::VersionPreviewService.resetFenceCount",
    ],
    why: "Version preview retains domain-owned deletion/reset counters.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
  {
    machine: "github_ops",
    exactFile: "ipc/services/github_ops_presentation_service.ts",
    mechanism: "initiatorRoutingMaps",
    boundaries: [
      "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.forget::uses(initiatorByOperationId)",
      "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.initiatorByOperationId",
      "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.recordInitiator::uses(initiatorByOperationId)",
      "ipc/services/github_ops_presentation_service.ts::GithubOpsPresentationService.showError::uses(initiatorByOperationId)",
    ],
    why: "GitHub presentation routing predates correlated operation ownership.",
    removalOwner: "Conditional follow-up A — GitHub operations",
  },
  {
    machine: "version_preview",
    exactFile: "ipc/services/version_preview_presentation_service.ts",
    mechanism: "initiatorRoutingMaps",
    boundaries: [
      "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.confirm::uses(initiatorByOperationId)",
      "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.forget::uses(initiatorByOperationId)",
      "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.initiatorByOperationId",
      "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.originEndpointFor::uses(initiatorByOperationId)",
      "ipc/services/version_preview_presentation_service.ts::VersionPreviewPresentationService.recordInitiator::uses(initiatorByOperationId)",
    ],
    why: "Version preview presentation still owns an operation route map.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
  {
    machine: "version_preview",
    exactFile: "ipc/services/version_preview_window_interest.ts",
    mechanism: "initiatorRoutingMaps",
    boundaries: [
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.acquire::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.acquireIfUnowned::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.clearAll::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.clearApp::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.inspect::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.isLastOwner::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.release::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.removeWindow::uses(windowIdsByAppId)",
      "ipc/services/version_preview_window_interest.ts::VersionPreviewWindowInterestService.windowIdsByAppId",
    ],
    why: "Version preview window interest has not migrated to shared leases.",
    removalOwner: "Conditional follow-up A — version-preview ownership",
  },
] as const satisfies readonly CompatibilityBoundaryEntry[];

/**
 * Exact negative classification used to make raw dispatch discovery
 * re-export-safe. These calls are unrelated queues or domain facades, so they
 * stay out of the unsafe escape-hatch report while remaining pinned.
 */
export const nonRemoteDispatchOrEnqueueInventory = [
  "hooks/useRunApp.ts::useRebuildAppAfterPnpmInstall::call(manager.dispatch)",
  "ipc/services/app_runtime_service.ts::listenToProcess::call(output.enqueue)::direct",
  "ipc/services/app_runtime_service.ts::listenToProcess::call(output.enqueue)::when(isInputRequest)",
  "ipc/services/app_runtime_transport.ts::IpcAppRuntimeOutput.enqueue::call(appOutputInterests.enqueue)",
  "ipc/services/main_app_runtime_output.ts::MainAppRuntimeOutput.enqueue::call(appOutputInterests.enqueue)",
  "ipc/utils/debug_fetch.ts::debugFetch.start::call(controller.enqueue)",
  "ipc/utils/fallback_ai_model.ts::FallbackModel.createWrappedStream.start.processStream::call(controller.enqueue)",
  "state_machines/dispatcher.ts::TransactionalDispatcher.send::call(this.enqueue)",
  "supabase_admin/supabase_deploy_queue.ts::enqueueSupabaseDeploy::call(queue.enqueue)",
  "version_preview/window_interest_client.ts::VersionPreviewWindowInterestClient.acquire::call(this.enqueue)",
  "version_preview/window_interest_client.ts::VersionPreviewWindowInterestClient.release::call(this.enqueue)",
  "version_preview/window_interest_client.ts::VersionPreviewWindowInterestClient.restoreIfOrphaned::call(this.enqueue)",
  "window_infrastructure/main/high_volume_interests.ts::HighVolumeWindowInterests.terminalFlush::call(this.enqueue)",
] as const;

/**
 * Framework-owned request protocol boundaries. These are correlated or
 * explicitly admission-only paths, not unmigrated raw domain dispatch.
 */
export const completionAwareDispatchOrEnqueueInventory = [
  "distributed_machines/operation_registry.ts::admitOperationAndEnqueue::access(options.enqueue)",
  "app_run/definition.ts::appRunDefinition.remoteIntent.finalizeOperation.admission::access(controls.enqueue)",
  "distributed_machines/operation_registry.ts::admitOperationAndEnqueue::call(options.enqueue)",
  "distributed_machines/prepared_request.ts::prepareRequest.dispatchAttempt.attempt::call(options.dispatch)",
  "distributed_machines/request_actor.ts::createCompletionAwareActor::access(options.enqueue)",
  "distributed_machines/request_actor.ts::createRemoteRequestActor.request.dispatchRequest::call(options.actor.dispatch)",
  "distributed_machines/request_actor.ts::dispatchRemoteAdmissionOnly::call(actor.dispatch)",
  "distributed_machines/use_machine_mutation.ts::useMachineMutation.retry::call(current.request.retry.dispatch)",
  "ipc/services/app_run_actor_service.ts::AppRunActorService.dispatchAndWait.admission.enqueue::call(actor.enqueue)",
] as const;

/**
 * Every direct actor-host creation capability remains review-visible. Producer
 * callbacks on migrated surfaces must use captured non-creating sinks instead
 * of adding a new ensure() call.
 */
export const actorEnsureInventory = [
  "chat_stream/preview_store.ts::ChatStreamPreviewStore.set::call(this.ensure)",
  "chat_stream/preview_store.ts::ChatStreamPreviewStore.subscribeKey::call(this.ensure)",
  "chat_stream/remote_manager.ts::ChatStreamRemoteManager.watchIdle::call(this.ensure)",
  "hooks/useChatStream.ts::useChatStreamState.getSnapshot::call(manager.ensure)",
  "hooks/useChatStream.ts::useChatStreamState.subscribe::call(manager.ensure)",
  "hooks/useResolveMergeConflictsWithAI.ts::useResolveMergeConflictsWithAI.resolveFilesWithAI::call(chatStreamManager.ensure)",
  "hooks/useStreamChat.ts::useStreamChat.cancelStream::call(chatStreamManager.ensure)",
  "hooks/useStreamChat.ts::useStreamChat.queueMessage::call(chatStreamManager.ensure)",
  "hooks/useStreamChat.ts::useStreamChat.setError::call(chatStreamManager.ensure)",
  "hooks/useStreamChat.ts::useStreamChat.streamMessage::call(chatStreamManager.ensure)",
  "ipc/services/app_run_actor_service.ts::AppRunActorService.actor::call(this.host.ensure)",
  "ipc/services/version_preview_actor_service.ts::VersionPreviewActorService.releaseWindowInterest::call(this.host.ensure)",
  "package_manager_warnings/store.ts::PackageManagerWarningStore.setWarning::call(this.host.ensure)",
  "preview_console/store.ts::PreviewConsoleStore.append::call(this.host.ensure)",
  "preview_console/store.ts::PreviewConsoleStore.replace::call(this.host.ensure)",
  "preview_iframe/manager.ts::PreviewIframeManager.send::call(this.host.ensure)",
  "screenshot/manager.ts::ScreenshotManager.send::call(this.host.ensure)",
  "state_machines/testing.ts::runControllerConformanceSuite::call(host.ensure)",
  "state_machines/testing.ts::runControllerConformanceSuite::call(host.ensure)",
  "testing/hybrid_chat_harness.tsx::setupHybridChatHarness.mountSurface.firstPromptChatStream.submit::call(chatStreamManager.ensure)",
  "version_preview/presentation_store.ts::VersionPreviewPresentationStore.send::call(this.ensure)",
  "version_preview/presentation_store.ts::VersionPreviewPresentationStore.subscribe::call(this.ensure)",
] as const;

/**
 * Stateful collection owners in migrated production files. Exact discovery
 * prevents a bespoke waiter, receipt, deduplication, or ownership registry
 * from appearing under a novel identifier without a review-visible update.
 */
export const migratedStatefulOwnerInventory = [
  "app_run/remote_manager.ts::AppRunRemoteManager.listeners::new(Set)",
  "app_run/transport.ts::appRunKeys::new(Map)",
  "hooks/useRunApp.ts::useAppOutputSubscription.unsubscribe.entriesByAppId::new(Map)",
  "image_generation/selectors.ts::chatJobsCache::new(WeakMap)",
  "ipc/services/app_runtime_service.ts::AppRuntimeService.externalClaims::new(Map)",
  "ipc/services/app_runtime_service.ts::AppRuntimeService.externalClaimsByApp::new(Map)",
  "ipc/services/app_runtime_service.ts::pnpmVersionMigrationNotifiedAppIds::new(Set)",
  "ipc/services/app_runtime_transport.ts::outputsBySender::new(WeakMap)",
  "ipc/services/image_generation_definition.ts::imageGenerationDefinition.createBeforeCommit.nextIds::new(Set)",
  "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.forgetApp.targets::new(Set)",
  "ipc/services/image_generation_presentation_service.ts::ImageGenerationPresentationService.initiatorByJobId::new(Map)",
  "ipc/services/image_generation_service.ts::ImageGenerationService.active::new(Map)",
  "ipc/services/image_generation_service.ts::ImageGenerationService.cancellationTombstones::new(Set)",
  "ipc/services/image_generation_service.ts::ImageGenerationService.deletionFences::new(Map)",
] as const;
