import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";

export const fixture: LocalAgentFixture = {
  description: "Change a file while a follow-up prompt is queued",
  turns: [
    {
      text: "I'll make the requested change.",
      toolCalls: [
        {
          name: "write_file",
          args: {
            path: "src/review-barrier.ts",
            content:
              "// review barrier fixture\n".repeat(400) +
              "export const reviewBarrierCovered = true;\n",
            description: "Add review barrier fixture",
          },
        },
      ],
    },
    {
      text: "The change is ready for review.",
    },
  ],
};
