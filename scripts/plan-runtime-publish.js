#!/usr/bin/env node
"use strict";

// Decide which patched Codex runtimes the Patched Codex Runtime workflow must
// build: the requested (or latest stable) upstream Codex version, for each macOS
// target whose archive for the current patch set is not yet published. Prints
// GitHub Actions outputs (key=value lines) for the plan job.

const { spawnSync } = require("child_process");

const { validateCodexVersion } = require("./install-patched-codex");
const { bundleNames } = require("./package-patched-runtime");

const UPSTREAM_REPO = "openai/codex";
const STABLE_TAG_RE = /^rust-v(\d+)\.(\d+)\.(\d+)$/;
// macos-15 is Apple Silicon; the Intel target needs the macos-15-intel label,
// which GitHub supports until August 2027.
const PUBLISH_TARGETS = Object.freeze([
  Object.freeze({ target: "aarch64-apple-darwin", runner: "macos-15" }),
  Object.freeze({ target: "x86_64-apple-darwin", runner: "macos-15-intel" }),
]);

function latestStableCodexVersion(tagNames) {
  const versions = tagNames
    .map((tag) => STABLE_TAG_RE.exec(String(tag).trim()))
    .filter(Boolean)
    .map((match) => match.slice(1, 4).map(Number));
  if (!versions.length) {
    throw new Error(`No stable rust-v<major>.<minor>.<patch> release found in ${UPSTREAM_REPO}`);
  }
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return versions[0].join(".");
}

function selectTargets(requested) {
  if (!requested || requested === "all") {
    return PUBLISH_TARGETS;
  }
  const match = PUBLISH_TARGETS.filter((entry) => entry.target === requested);
  if (!match.length) {
    throw new Error(`Unknown target: ${requested}; expected all or one of ${PUBLISH_TARGETS.map((e) => e.target).join(", ")}`);
  }
  return match;
}

function missingRuntimeTargets(version, targets, publishedAssetNames) {
  const published = new Set(publishedAssetNames);
  return targets.filter((entry) => {
    const names = bundleNames(version, entry.target);
    return !published.has(names.archiveName) || !published.has(names.checksumName);
  });
}

function gh(args, options = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (options.allowFailure) {
      return null;
    }
    throw new Error(`gh ${args.join(" ")} failed: ${String(result.stderr || "").trim()}`);
  }
  return result.stdout;
}

function main(env = process.env) {
  const version = env.REQUESTED_VERSION
    ? env.REQUESTED_VERSION.trim()
    : latestStableCodexVersion(
      JSON.parse(gh(["release", "list", "-R", UPSTREAM_REPO, "--exclude-pre-releases", "--exclude-drafts", "--limit", "100", "--json", "tagName"]))
        .map((release) => release.tagName),
    );
  validateCodexVersion(version, "codex_version");

  const releaseJson = gh(
    ["release", "view", `codex-runtime-v${version}`, "-R", env.GITHUB_REPOSITORY, "--json", "assets"],
    { allowFailure: true },
  );
  const publishedAssetNames = releaseJson ? JSON.parse(releaseJson).assets.map((asset) => asset.name) : [];
  const missing = missingRuntimeTargets(version, selectTargets(env.REQUESTED_TARGET), publishedAssetNames);

  console.log(`codex_version=${version}`);
  console.log(`matrix=${JSON.stringify({ include: missing })}`);
  console.log(`build=${missing.length > 0}`);
  console.error(
    missing.length
      ? `Codex ${version}: building ${missing.map((entry) => entry.target).join(", ")}`
      : `Codex ${version}: every requested runtime is already published`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { PUBLISH_TARGETS, latestStableCodexVersion, missingRuntimeTargets, selectTargets };
