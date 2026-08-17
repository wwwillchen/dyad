interface BundleChunk {
  type: "chunk";
  isEntry: boolean;
  dynamicImports: string[];
  modules: Record<string, unknown>;
}

interface BundleAsset {
  type: "asset";
}

type BootstrapBundle = Record<string, BundleChunk | BundleAsset>;

interface BootstrapOutputOptions {
  format?: string;
  inlineDynamicImports?: boolean;
}

function containsModule(chunk: BundleChunk, suffix: string): boolean {
  return Object.keys(chunk.modules).some((moduleId) =>
    moduleId.replaceAll("\\", "/").endsWith(suffix),
  );
}

export function assertDeferredMainBootstrapBundle(
  outputOptions: BootstrapOutputOptions,
  bundle: BootstrapBundle,
): void {
  if (outputOptions.format !== "cjs") {
    throw new Error(
      `The Electron main bundle must use CommonJS, received ${outputOptions.format ?? "an unspecified format"}`,
    );
  }
  if (outputOptions.inlineDynamicImports !== false) {
    throw new Error(
      "The Electron main bundle must keep dynamic imports in separate chunks",
    );
  }

  const bootstrapChunk = Object.values(bundle).find(
    (entry): entry is BundleChunk =>
      entry.type === "chunk" && containsModule(entry, "/src/main_bootstrap.ts"),
  );
  if (!bootstrapChunk) {
    throw new Error("The Electron main bundle is missing its bootstrap entry");
  }

  const hasDeferredMainChunk = bootstrapChunk.dynamicImports.some(
    (fileName) => {
      const entry = bundle[fileName];
      return (
        entry?.type === "chunk" &&
        !entry.isEntry &&
        containsModule(entry, "/src/main.ts")
      );
    },
  );
  if (!hasDeferredMainChunk) {
    throw new Error(
      "The Electron application runtime must remain a deferred main.ts chunk",
    );
  }
}
