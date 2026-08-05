#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { isPrereleaseVersion } = require("./release-version-utils.js");

const PROVENANCE_ASSET_PREFIX = "release-provenance-";
const PROVENANCE_ASSET_SUFFIX = ".json";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assetDigest(asset) {
  const match = asset.digest?.match(/^sha256:([a-f0-9]{64})$/i);
  if (!match) {
    throw new Error(`${asset.name} has no GitHub SHA-256 digest`);
  }
  return match[1].toLowerCase();
}

function isProvenanceAsset(name) {
  return (
    name.startsWith(PROVENANCE_ASSET_PREFIX) &&
    name.endsWith(PROVENANCE_ASSET_SUFFIX)
  );
}

function verifyReleaseAssetProvenance(assets, provenanceDirectory) {
  const uploadedAssets = new Map(assets.map((asset) => [asset.name, asset]));
  const manifestNames = assets
    .map((asset) => asset.name)
    .filter(isProvenanceAsset)
    .sort();
  const localManifestNames = fs
    .readdirSync(provenanceDirectory)
    .filter(isProvenanceAsset)
    .sort();

  if (
    manifestNames.length !== localManifestNames.length ||
    manifestNames.some((name, index) => name !== localManifestNames[index])
  ) {
    throw new Error(
      "Uploaded provenance manifests do not match the locally generated manifests",
    );
  }

  const provenArtifacts = new Map();
  for (const manifestName of localManifestNames) {
    const manifestPath = path.join(provenanceDirectory, manifestName);
    const bytes = fs.readFileSync(manifestPath);
    const uploadedManifest = uploadedAssets.get(manifestName);
    if (
      !uploadedManifest ||
      uploadedManifest.size !== bytes.byteLength ||
      assetDigest(uploadedManifest) !== sha256(bytes)
    ) {
      throw new Error(
        `Uploaded provenance manifest ${manifestName} does not match the local manifest`,
      );
    }

    const provenance = JSON.parse(bytes.toString("utf8"));
    if (
      !Array.isArray(provenance.artifacts) ||
      provenance.artifacts.length === 0
    ) {
      throw new Error(`${manifestName} does not contain release artifacts`);
    }
    for (const artifact of provenance.artifacts) {
      if (provenArtifacts.has(artifact.name)) {
        throw new Error(
          `Release artifact ${artifact.name} appears in multiple provenance manifests`,
        );
      }
      provenArtifacts.set(artifact.name, artifact);
    }
  }

  const releaseArtifacts = assets.filter(
    (asset) => !isProvenanceAsset(asset.name),
  );
  if (releaseArtifacts.length !== provenArtifacts.size) {
    throw new Error("Release asset set does not match provenance");
  }
  for (const asset of releaseArtifacts) {
    const proven = provenArtifacts.get(asset.name);
    if (
      !proven ||
      proven.sha256?.toLowerCase() !== assetDigest(asset) ||
      proven.size !== asset.size
    ) {
      throw new Error(`Release asset ${asset.name} does not match provenance`);
    }
  }
}

/**
 * Verifies that all expected binary assets are present in the GitHub release
 * for the version specified in package.json
 */
async function verifyReleaseAssets() {
  try {
    // Read version from package.json
    const packagePath = path.join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const version = packageJson.version;

    console.log(`🔍 Verifying release assets for version ${version}...`);

    // GitHub API configuration
    const owner = "dyad-sh";
    const repo = "dyad";
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    // Fetch all releases (including drafts)
    const tagName = `v${version}`;

    console.log(`📡 Fetching all releases to find: ${tagName}`);

    const allReleasesUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
    const response = await fetch(allReleasesUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "dyad-release-verifier",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const allReleases = await response.json();
    const release = allReleases.find((r) => r.tag_name === tagName);

    if (!release) {
      throw new Error(
        `Release ${tagName} not found in published releases or drafts. Make sure the release exists.`,
      );
    }

    const assets = release.assets || [];

    console.log(`📦 Found ${assets.length} assets in release ${tagName}`);
    console.log(`📄 Release status: ${release.draft ? "DRAFT" : "PUBLISHED"}`);

    const expectedPrerelease = isPrereleaseVersion(version);
    if (release.prerelease !== expectedPrerelease) {
      throw new Error(
        `Release ${tagName} prerelease flag is ${release.prerelease}, expected ${expectedPrerelease}`,
      );
    }

    // Handle different beta naming conventions across platforms
    const normalizeVersionForPlatform = (version, platform) => {
      if (!version.includes("beta")) {
        return version;
      }

      switch (platform) {
        case "rpm":
        case "deb":
          // RPM and DEB use dots: 0.14.0-beta.1 -> 0.14.0.beta.1
          return version.replace("-beta.", ".beta.");
        case "nupkg":
          // NuGet removes the dot: 0.14.0-beta.1 -> 0.14.0-beta1
          return version.replace("-beta.", "-beta");
        default:
          // Windows installer and macOS zips keep original format
          return version;
      }
    };

    // Define expected assets with platform-specific version handling
    const expectedAssets = [
      `dyad-${normalizeVersionForPlatform(version, "rpm")}-1.x86_64.rpm`,
      `dyad-${normalizeVersionForPlatform(version, "nupkg")}-full.nupkg`,
      `dyad-${version}.Setup.exe`,
      `dyad-darwin-arm64-${version}.zip`,
      `dyad-darwin-x64-${version}.zip`,
      `dyad_${normalizeVersionForPlatform(version, "deb")}_amd64.deb`,
      `dyad_${version}_x86_64.AppImage`,
      "RELEASES",
      "release-provenance-linux.json",
      "release-provenance-macos-intel.json",
      "release-provenance-macos.json",
      "release-provenance-windows.json",
    ];

    console.log("📋 Expected assets:");
    expectedAssets.forEach((asset) => console.log(`  - ${asset}`));
    console.log("");

    // Get actual asset names
    const actualAssets = assets.map((asset) => asset.name);

    console.log("📋 Actual assets:");
    actualAssets.forEach((asset) => console.log(`  - ${asset}`));
    console.log("");

    // Check for missing assets
    const missingAssets = expectedAssets.filter(
      (expected) => !actualAssets.includes(expected),
    );

    if (missingAssets.length > 0) {
      console.error("❌ VERIFICATION FAILED!");
      console.error("📭 Missing assets:");
      missingAssets.forEach((asset) => console.error(`  - ${asset}`));
      console.error("");
      console.error(
        "Please ensure all platforms have completed their builds and uploads.",
      );
      process.exit(1);
    }

    // Extra assets are not covered by provenance and would make downstream
    // trusted-release verification reject the release.
    const unexpectedAssets = actualAssets.filter(
      (actual) => !expectedAssets.includes(actual),
    );

    if (unexpectedAssets.length > 0) {
      console.error("❌ VERIFICATION FAILED!");
      console.error("📦 Unexpected assets:");
      unexpectedAssets.forEach((asset) => console.error(`  - ${asset}`));
      console.error("");
      console.error(
        "Remove stale assets from the draft and rerun the release.",
      );
      process.exit(1);
    }

    verifyReleaseAssetProvenance(assets, path.join(__dirname, "..", "out"));

    console.log("✅ VERIFICATION PASSED!");
    console.log(
      `🎉 All ${expectedAssets.length} expected assets are present in release ${tagName}`,
    );
    console.log("");
    console.log("📊 Release Summary:");
    console.log(`  Release: ${release.name || tagName}`);
    console.log(`  Tag: ${release.tag_name}`);
    console.log(`  Published: ${release.published_at}`);
    console.log(`  URL: ${release.html_url}`);
  } catch (error) {
    console.error("❌ Error verifying release assets:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  verifyReleaseAssets();
}

module.exports = { verifyReleaseAssetProvenance };
