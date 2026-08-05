// @vitest-environment node

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  verifyReleaseAssetProvenance,
} = require("../../scripts/verify-release-assets.js");

const temporaryDirectories: string[] = [];

function sha256(bytes: Buffer | string) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dyad-release-verification-"),
  );
  temporaryDirectories.push(directory);

  const artifact = {
    name: "dyad-1.10.0-beta.1.Setup.exe",
    sha256: sha256("binary"),
    size: Buffer.byteLength("binary"),
  };
  const manifestName = "release-provenance-windows.json";
  const manifest = Buffer.from(
    `${JSON.stringify({ artifacts: [artifact] }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(directory, manifestName), manifest);

  return {
    assets: [
      {
        digest: `sha256:${artifact.sha256}`,
        name: artifact.name,
        size: artifact.size,
      },
      {
        digest: `sha256:${sha256(manifest)}`,
        name: manifestName,
        size: manifest.byteLength,
      },
    ],
    directory,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("release asset provenance verification", () => {
  it("accepts uploaded assets with the exact proven names, digests, and sizes", () => {
    const { assets, directory } = createFixture();

    expect(() => verifyReleaseAssetProvenance(assets, directory)).not.toThrow();
  });

  it("rejects an uploaded asset whose sanitized name is absent from provenance", () => {
    const { assets, directory } = createFixture();
    assets[0].name = "dyad-1.10.0-beta.1 Setup.exe";

    expect(() => verifyReleaseAssetProvenance(assets, directory)).toThrow(
      "Release asset dyad-1.10.0-beta.1 Setup.exe does not match provenance",
    );
  });

  it("rejects an uploaded manifest that differs from the local attested file", () => {
    const { assets, directory } = createFixture();
    assets[1].digest = `sha256:${"0".repeat(64)}`;

    expect(() => verifyReleaseAssetProvenance(assets, directory)).toThrow(
      "Uploaded provenance manifest release-provenance-windows.json does not match the local manifest",
    );
  });
});
