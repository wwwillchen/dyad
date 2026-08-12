import { testSkipIfWindows } from "./helpers/test_helper";

testSkipIfWindows(
  "local-agent - sub-agent tools replace root explore_code",
  async ({ po }) => {
    await po.setUpDyadPro({ localAgent: true });
    await po.importApp("minimal");
    await po.chatActions.selectLocalAgentMode();

    await po.sendPrompt("[dump]");
    await po.snapshotServerDump("request", { name: "subagents" });
  },
);
