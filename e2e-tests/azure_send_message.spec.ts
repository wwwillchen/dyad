import { testWithConfigSkipIfWindows } from "./helpers/test_helper";

// Keep fake Azure credentials scoped to this Electron launch, not later tests.
const azureEnvNames = [
  "TEST_AZURE_BASE_URL",
  "AZURE_API_KEY",
  "AZURE_RESOURCE_NAME",
] as const;
const originalAzureEnv = new Map(
  azureEnvNames.map((name) => [name, process.env[name]]),
);

const testAzure = testWithConfigSkipIfWindows({
  postLaunchHook: async () => {
    for (const name of azureEnvNames) {
      const value = originalAzureEnv.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  },
  preLaunchHook: async ({ fakeLlmPort }) => {
    process.env.TEST_AZURE_BASE_URL = `http://localhost:${fakeLlmPort}/azure`;
    process.env.AZURE_API_KEY = "fake-azure-key-for-testing";
    process.env.AZURE_RESOURCE_NAME = "fake-resource-for-testing";
  },
});

testAzure("send message through Azure OpenAI", async ({ po }) => {
  // Set up Azure without test provider
  await po.setUpAzure();

  // Select Azure model
  await po.modelPicker.selectTestAzureModel();

  // Send a test prompt that returns a normal conversational response
  await po.sendPrompt("tc=basic");

  // Verify we get a response (this means Azure integration is working)
  await po.snapshotMessages();
});
