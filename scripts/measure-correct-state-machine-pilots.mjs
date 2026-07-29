import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const baseline = args.get("--baseline") ?? "0be0cb40a";
const post = args.get("--post") ?? "WORKTREE";

const inventories = {
  app_run: {
    baseline: [
      ["admission", "src/app_run/remote_manager.ts", 103, 209],
      ["admission", "src/ipc/services/app_run_actor_service.ts", 63, 123],
      ["admission", "src/hooks/useRunApp.ts", 199, 254],
      ["subscription", "src/app_run/remote_manager.ts", 48, 51],
      ["subscription", "src/app_run/remote_manager.ts", 267, 301],
      ["settlement", "src/app_run/remote_manager.ts", 53, 56],
      ["settlement", "src/app_run/remote_manager.ts", 330, 361],
      ["settlement", "src/ipc/services/app_run_actor_service.ts", 19, 23],
      ["settlement", "src/ipc/services/app_run_actor_service.ts", 208, 317],
      ["late-producer", "src/ipc/services/app_run_actor_service.ts", 30, 62],
      ["late-producer", "src/ipc/services/app_run_actor_service.ts", 124, 188],
    ],
    post: [
      ["admission", "src/app_run/remote_manager.ts", 118, 319],
      ["admission", "src/ipc/services/app_run_actor_service.ts", 96, 156],
      ["admission", "src/ipc/services/app_run_actor_service.ts", 268, 371],
      ["admission", "src/hooks/useRunApp.ts", 217, 322],
      ["settlement", "src/app_run/operations.ts", 1, 102],
      ["deletion-fence", "src/ipc/services/app_run_actor_service.ts", 228, 241],
      ["late-producer", "src/ipc/services/app_run_actor_service.ts", 64, 95],
      ["late-producer", "src/ipc/services/app_run_actor_service.ts", 157, 227],
    ],
  },
  image_generation: {
    baseline: [
      ["admission", "src/hooks/useGenerateImage.ts", 6, 54],
      ["settlement", "src/ipc/services/image_generation_service.ts", 68, 68],
      ["settlement", "src/ipc/services/image_generation_service.ts", 72, 93],
      ["settlement", "src/ipc/services/image_generation_service.ts", 340, 383],
      [
        "deletion-fence",
        "src/ipc/services/image_generation_service.ts",
        69,
        71,
      ],
      [
        "deletion-fence",
        "src/ipc/services/image_generation_service.ts",
        94,
        120,
      ],
      [
        "late-producer",
        "src/ipc/services/image_generation_definition.ts",
        32,
        70,
      ],
      [
        "late-producer",
        "src/ipc/services/image_generation_actor_service.ts",
        17,
        39,
      ],
    ],
    post: [
      ["admission", "src/hooks/useGenerateImage.ts", 50, 155],
      ["admission", "src/image_generation/hooks.ts", 53, 239],
      [
        "settlement",
        "src/ipc/services/image_generation_operation_service.ts",
        24,
        174,
      ],
      ["settlement", "src/ipc/services/image_generation_service.ts", 68, 69],
      ["settlement", "src/ipc/services/image_generation_service.ts", 73, 100],
      ["settlement", "src/ipc/services/image_generation_service.ts", 347, 412],
      [
        "deletion-fence",
        "src/ipc/services/image_generation_service.ts",
        70,
        72,
      ],
      [
        "deletion-fence",
        "src/ipc/services/image_generation_service.ts",
        101,
        127,
      ],
      [
        "deletion-fence",
        "src/ipc/services/image_generation_actor_service.ts",
        20,
        114,
      ],
      [
        "late-producer",
        "src/ipc/services/image_generation_definition.ts",
        53,
        154,
      ],
    ],
  },
};

function sourceAt(ref, file) {
  if (ref === "WORKTREE") return fs.readFileSync(file, "utf8");
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

function codeLines(source) {
  const lines = new Set();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source,
  );
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    const start = source.slice(0, scanner.getTokenPos()).split(/\r?\n/).length;
    const end = source.slice(0, scanner.getTextPos()).split(/\r?\n/).length;
    for (let line = start; line <= end; line += 1) lines.add(line);
  }
  return lines;
}

function measure(ref, inventory) {
  const byFile = new Map();
  const categoryLines = new Map();
  for (const [category, file, start, end] of inventory) {
    let measured = byFile.get(file);
    if (!measured) {
      const source = sourceAt(ref, file);
      measured = { source, code: codeLines(source) };
      byFile.set(file, measured);
    }
    const owned = categoryLines.get(category) ?? new Map();
    const lines = owned.get(file) ?? new Set();
    for (let line = start; line <= end; line += 1) {
      if (measured.code.has(line)) lines.add(line);
    }
    owned.set(file, lines);
    categoryLines.set(category, owned);
  }
  const categories = {};
  let total = 0;
  for (const [category, files] of categoryLines) {
    const count = [...files.values()].reduce(
      (sum, lines) => sum + lines.size,
      0,
    );
    categories[category] = count;
    total += count;
  }
  return { categories, total };
}

const report = {};
for (const [pilot, inventory] of Object.entries(inventories)) {
  const before = measure(baseline, inventory.baseline);
  const after = measure(post, inventory.post);
  report[pilot] = {
    baseline: before,
    post: after,
    reductionPercent:
      before.total === 0
        ? null
        : Number(
            (((before.total - after.total) / before.total) * 100).toFixed(1),
          ),
  };
}

process.stdout.write(
  `${JSON.stringify({ baseline, post, inventories, report }, null, 2)}\n`,
);
