#!/usr/bin/env node
"use strict";

// Package a patched Codex payload into the release bundle that
// install-patched-codex.js downloads and verifies in patched mode:
//
//   <dist>/codex-hud-codex-v<version>-<target>.tar.gz
//   <dist>/codex-hud-codex-v<version>-<target>.tar.gz.sha256
//
// The archive holds one top-level directory named after the bundle that
// contains `codex` (`codex.exe` for Windows targets), the upstream `LICENSE`
// and `NOTICE`, and the
// `codex-hud-runtime.json` provenance manifest. CI and the maintainer's
// local-publish path share this script so both produce byte-compatible
// bundles; the installer's prebuilt verification is the only consumer.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  KNOWN_RUNTIME_TARGETS,
  PATCH_SET_REVISION,
  RUNTIME_MANIFEST_NAME,
  validateCodexVersion,
} = require("./install-patched-codex");

const REQUIRED_SOURCE_FILES = ["LICENSE", "NOTICE"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  return result.stdout;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runtimeTargetTraits(target) {
  if (!KNOWN_RUNTIME_TARGETS.includes(target)) {
    throw new Error(`--target must be one of ${KNOWN_RUNTIME_TARGETS.join(", ")}, got: ${target}`);
  }
  const darwinArchitecture = target === "x86_64-apple-darwin"
    ? "x86_64"
    : target === "aarch64-apple-darwin"
      ? "arm64"
      : null;
  return {
    binaryName: target.endsWith("-pc-windows-msvc") ? "codex.exe" : "codex",
    darwinArchitecture,
  };
}

function validateSourceCommit(value) {
  if (!/^[0-9a-f]{40}$/.test(value || "")) {
    throw new Error(`source commit must be a 40-character lowercase Git SHA, got: ${value || "missing"}`);
  }
}

function resolveSourceCommit(options) {
  if (options.sourceCommit) {
    validateSourceCommit(options.sourceCommit);
    return options.sourceCommit;
  }
  const runCommand = options.runCommand || run;
  const commit = String(runCommand("git", ["-C", options.sourceDir, "rev-parse", "HEAD"])).trim();
  validateSourceCommit(commit);
  return commit;
}

function bundleNames(version, target) {
  const baseName = `codex-hud-codex-v${version}-${target}`;
  const archiveName = `${baseName}.tar.gz`;
  return { baseName, archiveName, checksumName: `${archiveName}.sha256` };
}

// Returns { baseName, archiveName, checksumName, archivePath, checksumPath,
// bundleDir, manifest }. `options.workDir` defaults to a fresh temp dir; the
// bundle directory inside it is left in place so callers can inspect it.
function packagePatchedRuntime(options) {
  const { payloadPath, version, target, sourceDir } = options;
  if (!payloadPath || !version || !target || !sourceDir) {
    throw new Error("payloadPath, version, target, and sourceDir are required");
  }
  validateCodexVersion(version, "--version");
  const targetTraits = runtimeTargetTraits(target);
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`payload not found: ${payloadPath}`);
  }
  for (const name of REQUIRED_SOURCE_FILES) {
    if (!fs.existsSync(path.join(sourceDir, name))) {
      throw new Error(`source checkout is missing ${name}: ${sourceDir}`);
    }
  }

  const runCommand = options.runCommand || run;
  const distDir = path.resolve(options.distDir || "dist");
  const workDir = options.workDir || fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-package-"));
  const names = bundleNames(version, target);
  const bundleDir = path.join(workDir, names.baseName);
  const bundledBinary = path.join(bundleDir, targetTraits.binaryName);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(payloadPath, bundledBinary);
  fs.chmodSync(bundledBinary, 0o755);
  for (const name of REQUIRED_SOURCE_FILES) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(bundleDir, name));
  }

  if (targetTraits.darwinArchitecture) {
    const reportedArchitectures = String(runCommand("lipo", ["-archs", bundledBinary], { timeout: 10000 }))
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!reportedArchitectures.includes(targetTraits.darwinArchitecture)) {
      throw new Error(
        `payload architecture mismatch for ${target}: expected ${targetTraits.darwinArchitecture}, ` +
        `lipo reported "${reportedArchitectures.join(" ") || "none"}"`,
      );
    }
  }

  const codesign = options.codesign === undefined
    ? process.platform === "darwin" && Boolean(targetTraits.darwinArchitecture)
    : Boolean(options.codesign);
  if (codesign) {
    runCommand("codesign", ["--force", "--sign", "-", bundledBinary]);
  }

  // Health check after signing: the payload must report the version it claims.
  const reported = String(runCommand(bundledBinary, ["--version"])).trim();
  if (!reported.includes(version)) {
    throw new Error(`packaged codex reported "${reported}", expected version ${version}`);
  }

  const manifest = {
    schemaVersion: 1,
    codexVersion: version,
    patchSetRevision: PATCH_SET_REVISION,
    sourceCommit: resolveSourceCommit({ ...options, runCommand }),
    payloadSha256: sha256File(bundledBinary),
  };
  fs.writeFileSync(path.join(bundleDir, RUNTIME_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);

  const archivePath = path.join(distDir, names.archiveName);
  const checksumPath = path.join(distDir, names.checksumName);
  fs.rmSync(archivePath, { force: true });
  runCommand("tar", ["-czf", archivePath, "-C", workDir, names.baseName]);
  // Same line shape `shasum -a 256` prints; the installer parses it with
  // checksumForAsset and requires the archive name to appear exactly once.
  fs.writeFileSync(checksumPath, `${sha256File(archivePath)}  ${names.archiveName}\n`);

  return { ...names, archivePath, checksumPath, bundleDir, manifest };
}

function parseArgs(argv) {
  const args = { codesign: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return argv[i];
    };
    switch (arg) {
      case "--payload": args.payloadPath = next(); break;
      case "--version": args.version = next(); break;
      case "--target": args.target = next(); break;
      case "--source": args.sourceDir = next(); break;
      case "--source-commit": args.sourceCommit = next(); break;
      case "--dist": args.distDir = next(); break;
      case "--work": args.workDir = next(); break;
      case "--no-codesign": args.codesign = false; break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return [
    "usage: package-patched-runtime.js --payload <codex> --version <x.y.z> --target <triple> --source <codex-src-dir>",
    "                                  [--dist <dir>] [--work <dir>] [--source-commit <sha>] [--no-codesign]",
    "",
    "Targets: " + KNOWN_RUNTIME_TARGETS.join(", "),
    "Writes <dist>/codex-hud-codex-v<version>-<target>.tar.gz and its .sha256 next to it.",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = packagePatchedRuntime(args);
  console.log(`Packaged runtime: ${result.archivePath}`);
  console.log(`Checksum: ${result.checksumPath}`);
  console.log(`Manifest: codex ${result.manifest.codexVersion}, patch-set ${result.manifest.patchSetRevision}, source ${result.manifest.sourceCommit}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { bundleNames, packagePatchedRuntime, parseArgs };
