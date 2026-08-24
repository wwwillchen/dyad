import { test, Timeout } from "./helpers/test_helper";

test("send message to ollama", async ({ po }) => {
  await po.modelPicker.selectTestOllamaModel();
  await po.sendPrompt("hi", { timeout: Timeout.EXTRA_LONG });
  await po.snapshotMessages();
});
