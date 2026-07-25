import { EntityDisposalRegistry } from "@/state_machines/entity_disposal";
import type { EntityDisposalEvent, VisibleEntity } from "../types";
import { windowRegistry, type WindowRegistry } from "./window_registry";

const ENTITY_DISPOSAL_CHANNEL = "window:entity-disposed";

export class EntityDisposalBus {
  private epoch = 0;

  constructor(
    private readonly registry: WindowRegistry,
    private readonly mainDisposals: EntityDisposalRegistry,
  ) {}

  publish(entity: VisibleEntity): EntityDisposalEvent {
    try {
      if (entity.kind === "app") {
        this.mainDisposals.disposeForApp(entity.id);
      } else {
        this.mainDisposals.disposeForChat(entity.id);
      }
    } catch (error) {
      console.error("Main entity disposal failed", { entity, error });
    }

    const event: EntityDisposalEvent = {
      epoch: ++this.epoch,
      entity,
    };
    for (const endpoint of this.registry.liveEndpoints()) {
      try {
        endpoint.send(ENTITY_DISPOSAL_CHANNEL, event);
      } catch (error) {
        console.error("Renderer entity disposal delivery failed", {
          entity,
          webContentsId: endpoint.id,
          error,
        });
      }
    }
    return event;
  }
}

export const mainEntityDisposalRegistry = new EntityDisposalRegistry();
export const entityDisposalBus = new EntityDisposalBus(
  windowRegistry,
  mainEntityDisposalRegistry,
);

export function entityDisposalChannel(): string {
  return ENTITY_DISPOSAL_CHANNEL;
}
