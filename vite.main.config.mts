import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import path from "path";

const nodeBuiltins = builtinModules.flatMap((name) => [name, `node:${name}`]);

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "pg-schema-classifier": path.resolve(
        __dirname,
        "./packages/pg-schema-classifier/src/index.ts",
      ),
      "ts-pg-schema-diff": path.resolve(
        __dirname,
        "./packages/ts-pg-schema-diff/src/index.ts",
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // main_bootstrap.ts relies on Rollup lowering its conditional runtime
        // import to a microtask-scheduled require before Electron becomes ready.
        format: "cjs",
      },
      external: [
        ...nodeBuiltins,
        "better-sqlite3",
        "dyad-keychain-reader",
        "node-pty",
        "mustardscript",
        "pg",
      ],
    },
  },
  plugins: [
    {
      name: "restart",
      closeBundle() {
        process.stdin.emit("data", "rs");
      },
    },
  ],
});
