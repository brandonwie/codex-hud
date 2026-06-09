#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const files = {
  packageJson: path.join(repoRoot, "package.json"),
  packageLock: path.join(repoRoot, "package-lock.json"),
  pluginManifest: path.join(repoRoot, "plugins", "codex-hud", ".codex-plugin", "plugin.json"),
  hudScript: path.join(repoRoot, "plugins", "codex-hud", "scripts", "codex-hud.js"),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readHudVersion() {
  const source = fs.readFileSync(files.hudScript, "utf8");
  const match = source.match(/const VERSION = "([^"]+)";/);
  if (!match) throw new Error("Could not find HUD VERSION constant");
  return match[1];
}

function writeHudVersion(version) {
  const source = fs.readFileSync(files.hudScript, "utf8");
  const updated = source.replace(/const VERSION = "[^"]+";/, `const VERSION = "${version}";`);
  if (updated === source) throw new Error("Could not update HUD VERSION constant");
  fs.writeFileSync(files.hudScript, updated, "utf8");
}

function getVersions() {
  const packageJson = readJson(files.packageJson);
  const packageLock = readJson(files.packageLock);
  const pluginManifest = readJson(files.pluginManifest);
  return {
    packageJson: packageJson.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages && packageLock.packages[""] && packageLock.packages[""].version,
    pluginManifest: pluginManifest.version,
    hudScript: readHudVersion(),
  };
}

function validateVersion(version) {
  if (!semverPattern.test(version)) {
    throw new Error(`Expected a semantic version without a leading v, got: ${version}`);
  }
}

function updateVersion(version) {
  validateVersion(version);

  const packageJson = readJson(files.packageJson);
  packageJson.version = version;
  writeJson(files.packageJson, packageJson);

  const packageLock = readJson(files.packageLock);
  packageLock.version = version;
  if (packageLock.packages && packageLock.packages[""]) {
    packageLock.packages[""].version = version;
  }
  writeJson(files.packageLock, packageLock);

  const pluginManifest = readJson(files.pluginManifest);
  pluginManifest.version = version;
  writeJson(files.pluginManifest, pluginManifest);

  writeHudVersion(version);
  console.log(`synced release version ${version}`);
}

function checkVersions() {
  const versions = getVersions();
  const expected = versions.packageJson;
  validateVersion(expected);
  const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
  if (mismatches.length) {
    for (const [name, version] of mismatches) {
      console.error(`${name} version mismatch: expected ${expected}, got ${version || "missing"}`);
    }
    process.exit(1);
  }
  console.log(`version surfaces OK: ${expected}`);
}

function main() {
  const arg = process.argv[2];
  if (arg === "--check") {
    checkVersions();
    return;
  }
  if (!arg) {
    console.error("Usage: node scripts/sync-release-version.js <version>|--check");
    process.exit(1);
  }
  updateVersion(arg.replace(/^v/, ""));
}

main();
