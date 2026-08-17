import { describe, expect, it } from "vitest";
import { assertDeferredMainBootstrapBundle } from "./main_bootstrap_bundle";

const deferredBundle = {
  "main_bootstrap.js": {
    type: "chunk" as const,
    isEntry: true,
    dynamicImports: ["main-abc123.js"],
    modules: { "/repo/src/main_bootstrap.ts": {} },
  },
  "main-abc123.js": {
    type: "chunk" as const,
    isEntry: false,
    dynamicImports: [],
    modules: { "/repo/src/main.ts": {} },
  },
};

describe("main bootstrap bundle verification", () => {
  it("accepts a CommonJS bootstrap with a deferred main chunk", () => {
    expect(() =>
      assertDeferredMainBootstrapBundle(
        { format: "cjs", inlineDynamicImports: false },
        deferredBundle,
      ),
    ).not.toThrow();
  });

  it("rejects a non-CommonJS main bundle", () => {
    expect(() =>
      assertDeferredMainBootstrapBundle(
        { format: "es", inlineDynamicImports: false },
        deferredBundle,
      ),
    ).toThrow("must use CommonJS");
  });

  it("rejects dynamic import inlining", () => {
    expect(() =>
      assertDeferredMainBootstrapBundle(
        { format: "cjs", inlineDynamicImports: true },
        deferredBundle,
      ),
    ).toThrow("must keep dynamic imports in separate chunks");
  });

  it("rejects a bootstrap without a deferred main chunk", () => {
    expect(() =>
      assertDeferredMainBootstrapBundle(
        { format: "cjs", inlineDynamicImports: false },
        {
          "main_bootstrap.js": {
            ...deferredBundle["main_bootstrap.js"],
            dynamicImports: [],
          },
        },
      ),
    ).toThrow("must remain a deferred main.ts chunk");
  });
});
