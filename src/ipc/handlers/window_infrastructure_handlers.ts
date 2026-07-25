import { createTypedHandler } from "./base";
import { windowInfrastructureContracts } from "../types/window_infrastructure";
import { windowRegistry } from "../../window_infrastructure/main/window_registry";
import { queryInvalidationBus } from "../../window_infrastructure/main/query_invalidation_bus";
import {
  appOutputInterests,
  chatChunkInterests,
} from "../../window_infrastructure/main/production_high_volume";

export function registerWindowInfrastructureHandlers(): void {
  createTypedHandler(
    windowInfrastructureContracts.bootstrap,
    async (event, input) => {
      const windowSessionId = windowRegistry.ensureRegistered(event.sender);
      const synchronization = queryInvalidationBus.synchronize(
        input.lastSeenQueryInvalidationEpoch,
      );
      return {
        windowSessionId,
        currentQueryInvalidationEpoch: synchronization.currentEpoch,
        missedInvalidations: synchronization.invalidations,
        recoveryScopes: synchronization.recoveryScopes,
      };
    },
  );

  createTypedHandler(
    windowInfrastructureContracts.setFocused,
    async (event) => {
      const sessionId = windowRegistry.ensureRegistered(event.sender);
      windowRegistry.setFocused(sessionId);
    },
  );

  createTypedHandler(
    windowInfrastructureContracts.setVisibleEntities,
    async (event, entities) => {
      const sessionId = windowRegistry.ensureRegistered(event.sender);
      windowRegistry.setVisibleEntities(sessionId, entities);
    },
  );

  createTypedHandler(
    windowInfrastructureContracts.attachInterest,
    async (event, interest) => {
      windowRegistry.ensureRegistered(event.sender);
      const interests =
        interest.kind === "app-output"
          ? appOutputInterests
          : chatChunkInterests;
      await interests.attach(event.sender.id, interest, () => []);
    },
  );

  createTypedHandler(
    windowInfrastructureContracts.detachInterest,
    async (event, interest) => {
      const interests =
        interest.kind === "app-output"
          ? appOutputInterests
          : chatChunkInterests;
      interests.detach(event.sender.id, interest);
    },
  );
}
