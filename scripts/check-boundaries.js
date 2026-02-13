#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const rendererTargets = [
  "src/renderer.tsx",
  "src/app",
  "src/atoms",
  "src/client_logic",
  "src/components",
  "src/contexts",
  "src/hooks",
  "src/i18n",
  "src/pages",
  "src/routes",
  "src/store",
];

const disallowedAliasPrefixes = [
  "@/main",
  "@/db",
  "@/ipc/handlers",
  "@/ipc/utils",
  "@/pro/main",
  "@/neon_admin",
  "@/supabase_admin",
  "@/paths",
];

const disallowedResolvedPaths = [
  "src/main",
  "src/main.ts",
  "src/preload.ts",
  "src/db",
  "src/ipc/handlers",
  "src/ipc/utils",
  "src/pro/main",
  "src/neon_admin",
  "src/supabase_admin",
  "src/paths",
].map((target) => path.resolve(repoRoot, target));

const importExportRegex =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\sfrom\s*)?["']([^"']+)["']/g;
const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function walkTsFiles(entryPath, files = []) {
  const absPath = path.resolve(repoRoot, entryPath);
  if (!fs.existsSync(absPath)) {
    return files;
  }

  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    if (/\.(ts|tsx)$/.test(absPath)) {
      files.push(absPath);
    }
    return files;
  }

  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    walkTsFiles(path.join(entryPath, entry.name), files);
  }

  return files;
}

function isDisallowedAliasImport(specifier) {
  return disallowedAliasPrefixes.some((prefix) => {
    return specifier === prefix || specifier.startsWith(`${prefix}/`);
  });
}

function isDisallowedResolvedImport(resolvedPath) {
  return disallowedResolvedPaths.some((forbiddenPath) => {
    return (
      resolvedPath === forbiddenPath ||
      resolvedPath.startsWith(`${forbiddenPath}${path.sep}`)
    );
  });
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function collectImports(content) {
  const imports = [];

  for (const match of content.matchAll(importExportRegex)) {
    imports.push({
      specifier: match[1],
      index: match.index ?? 0,
    });
  }

  for (const match of content.matchAll(dynamicImportRegex)) {
    imports.push({
      specifier: match[1],
      index: match.index ?? 0,
    });
  }

  return imports;
}

function checkRendererBoundaries(files) {
  const violations = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const imports = collectImports(content);

    for (const imported of imports) {
      const { specifier, index } = imported;
      const line = getLineNumber(content, index);

      if (specifier.startsWith("@/")) {
        if (isDisallowedAliasImport(specifier)) {
          violations.push({
            file: toPosixPath(path.relative(repoRoot, filePath)),
            line,
            specifier,
          });
        }
        continue;
      }

      if (specifier.startsWith(".")) {
        const resolvedPath = path.resolve(path.dirname(filePath), specifier);
        if (isDisallowedResolvedImport(resolvedPath)) {
          violations.push({
            file: toPosixPath(path.relative(repoRoot, filePath)),
            line,
            specifier,
          });
        }
      }
    }
  }

  return violations;
}

function warnLargeFiles() {
  const srcFiles = walkTsFiles("src");
  const largeFiles = [];

  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const lineCount = content.split(/\r?\n/).length;
    if (lineCount >= 800) {
      largeFiles.push({
        file: toPosixPath(path.relative(repoRoot, filePath)),
        lineCount,
      });
    }
  }

  largeFiles.sort((a, b) => b.lineCount - a.lineCount);

  if (largeFiles.length === 0) {
    return;
  }

  console.log(
    `Warning: ${largeFiles.length} files are 800+ lines (soft warning).`,
  );
  for (const entry of largeFiles.slice(0, 15)) {
    console.log(
      `  ${entry.lineCount.toString().padStart(4, " ")} ${entry.file}`,
    );
  }
}

function main() {
  const rendererFiles = rendererTargets.flatMap((target) =>
    walkTsFiles(target),
  );
  const violations = checkRendererBoundaries(rendererFiles);

  warnLargeFiles();

  if (violations.length > 0) {
    console.error("");
    console.error(
      `Boundary check failed with ${violations.length} renderer import violation(s):`,
    );
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line} imports "${violation.specifier}"`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Boundary check passed for ${rendererFiles.length} renderer file(s).`,
  );
}

main();
