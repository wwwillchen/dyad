import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";

export const fixture: LocalAgentFixture = {
  description: "Resolve the deterministic Git merge conflict fixture",
  turns: [
    {
      text: "I'll resolve the merge conflict while preserving the feature change.",
      toolCalls: [
        {
          name: "write_file",
          args: {
            path: "conflict.txt",
            content: "Line 1\nLine 2 Modified Feature\nLine 3",
            description: "Resolve merge conflicts",
          },
        },
      ],
    },
    {
      text: "The merge conflict is resolved.",
    },
  ],
};
