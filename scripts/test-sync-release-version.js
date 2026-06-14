#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-sync-version-test-"));
process.on("exit", () => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeFile(relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function run(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "sync-release-version.js"), ...args], {
    encoding: "utf8",
  });
}

fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
fs.copyFileSync(path.join(repoRoot, "scripts", "sync-release-version.js"), path.join(root, "scripts", "sync-release-version.js"));

writeFile("package.json", JSON.stringify({ version: "0.2.0" }, null, 2) + "\n");
writeFile("package-lock.json", JSON.stringify({ version: "0.2.0", packages: { "": { version: "0.2.0" } } }, null, 2) + "\n");
writeFile("plugins/codex-hud/.codex-plugin/plugin.json", JSON.stringify({ version: "0.2.0" }, null, 2) + "\n");
writeFile("plugins/codex-hud/scripts/codex-hud.js", 'const VERSION = "0.2.0";\n');
writeFile("rust/Cargo.toml", '[package]\nname = "codex-hud"\nversion = "0.2.0"\n');
writeFile("rust/Cargo.lock", '[[package]]\r\nname = "codex-hud"\r\nversion = "0.2.0"\r\n\r\n[[package]]\r\nname = "other"\r\nversion = "1.0.0"\r\n');
writeFile("site/index.html", '<script type="application/ld+json">{"softwareVersion": "0.2.0"}</script>\n');

let result = run(["--check"]);
assert.strictEqual(result.status, 0, result.stderr || result.stdout);

result = run(["0.3.0"]);
assert.strictEqual(result.status, 0, result.stderr || result.stdout);
assert.strictEqual(JSON.parse(readFile("package.json")).version, "0.3.0");
assert.strictEqual(JSON.parse(readFile("package-lock.json")).packages[""].version, "0.3.0");
assert.match(readFile("plugins/codex-hud/scripts/codex-hud.js"), /const VERSION = "0\.3\.0";/);
assert.match(readFile("rust/Cargo.toml"), /^version = "0\.3\.0"$/m);
assert.match(readFile("rust/Cargo.lock"), /\[\[package\]\]\r\nname = "codex-hud"\r\nversion = "0\.3\.0"/);
assert.match(readFile("site/index.html"), /"softwareVersion": "0\.3\.0"/);

const goodSite = readFile("site/index.html");
writeFile("site/index.html", '<script type="application/ld+json">{"name": "no version"}</script>\n');
result = run(["--check"]);
assert.notStrictEqual(result.status, 0, "missing site softwareVersion must fail --check");
assert.match(result.stderr, /softwareVersion/, "error must name the missing site softwareVersion");
writeFile("site/index.html", goodSite);

writeFile(
  "rust/Cargo.lock",
  `${readFile("rust/Cargo.lock")}\r\n[[package]]\r\nname = "codex-hud"\r\nversion = "0.1.0"\r\n`,
);
result = run(["--check"]);
assert.notStrictEqual(result.status, 0, "duplicate codex-hud package entries must fail --check");
assert.match(result.stderr, /Expected exactly one Cargo\.lock codex-hud package entry, found 2/);

// Parity (F-T-2): the sync script's version surfaces must equal the
// @semantic-release/git assets, so a release commits every file the prepare
// step rewrites. Checked against the real repo, not the temp fixture.
const syncSource = fs.readFileSync(path.join(repoRoot, "scripts", "sync-release-version.js"), "utf8");
const filesBlock = syncSource.match(/const files = \{([\s\S]*?)\r?\n\};/);
assert(filesBlock, "could not locate the files block in sync-release-version.js");
const syncSurfaces = [...filesBlock[1].matchAll(/path\.join\(repoRoot,\s*([^)]+)\)/g)]
  .map((m) => m[1].split(",").map((part) => part.trim().replace(/^["']|["']$/g, "")).join("/"))
  .sort();
const releaserc = JSON.parse(fs.readFileSync(path.join(repoRoot, ".releaserc.json"), "utf8"));
const gitPlugin = releaserc.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/git");
assert(gitPlugin, "could not find @semantic-release/git plugin in .releaserc.json");
const assets = [...gitPlugin[1].assets].sort();
assert.deepStrictEqual(
  syncSurfaces,
  assets,
  `sync-release-version.js surfaces must match @semantic-release/git assets\n  sync:   ${JSON.stringify(syncSurfaces)}\n  assets: ${JSON.stringify(assets)}`,
);

console.log("sync release version tests passed");
