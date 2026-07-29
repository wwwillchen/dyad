import { appRunConformance } from "@/app_run/conformance.test_support";
import { imageGenerationConformance } from "@/image_generation/conformance.test_support";
import { runPilotFrameworkConformanceSuite } from "./pilot_framework_conformance";

runPilotFrameworkConformanceSuite({
  conformance: appRunConformance,
  key: 41,
  invocationKind: "app-run",
});

runPilotFrameworkConformanceSuite({
  conformance: imageGenerationConformance,
  key: "jobs",
  invocationKind: "image-generation",
});
