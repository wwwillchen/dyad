import { test, Timeout } from "./helpers/test_helper";

test("send message to LM studio", async ({ po }) => {
  await po.modelPicker.selectTestLMStudioModel();
  await po.sendPrompt("hi", { timeout: Timeout.EXTRA_LONG });
  await po.snapshotMessages();
});
