import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";

export const fixture: LocalAgentFixture = {
  description: "Fix a security issue in the codebase",
  turns: [
    {
      text: "I'll apply the security fix now.",
      toolCalls: [
        {
          name: "write_file",
          args: {
            path: "file1.txt",
            content: "security fix\n",
            description: "Fix security vulnerability",
          },
        },
      ],
    },
    {
      text: "I've applied and committed the security fix. EOM",
    },
  ],
};
