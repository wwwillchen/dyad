import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";

/**
 * Write a file, then keep the generation open so the real Stop control can
 * interrupt the turn after a user-visible mutation but before finalization.
 */
export const fixture: LocalAgentFixture = {
  description: "Write a partial file, then stall until the turn is cancelled",
  turns: [
    {
      text: "I'll start creating the requested file.",
      toolCalls: [
        {
          name: "write_file",
          args: {
            path: "src/stopped-generation.ts",
            content: `export const stoppedGeneration = "partial";
`,
            description: "Create the partial generation file",
          },
        },
      ],
    },
    {
      delayMs: 30_000,
      text: "Finishing the remaining work...",
    },
  ],
};
