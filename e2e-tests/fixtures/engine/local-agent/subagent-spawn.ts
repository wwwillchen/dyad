import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";

export const fixture: LocalAgentFixture = {
  description: "Spawn and join a durable Explorer sub-agent",
  turns: [
    {
      text: "I'll delegate a focused read-only inspection.",
      toolCalls: [
        {
          name: "spawn_agent",
          args: {
            persona: "explorer",
            task_name: "Inspect app entry",
            assignment: "Find the app entry point and report what it renders.",
            scope: ["src"],
          },
        },
      ],
    },
    {
      text: "The Explorer completed its inspection.",
    },
  ],
};
