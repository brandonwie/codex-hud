#!/usr/bin/env node
// Regenerates plugins/codex-hud/vendor/toml.js from the installed smol-toml dev
// dependency. The vendored file is committed so the HUD can require a TOML parser
// WITHOUT a runtime `npm install` — the patched-Codex launcher runs the HUD from
// a repo path that has no node_modules, so a bare require('smol-toml') would throw
// MODULE_NOT_FOUND on every status-line draw. Run after bumping the devDependency.
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const smolDir = path.join(repoRoot, "node_modules", "smol-toml");
const pkg = require(path.join(smolDir, "package.json"));
const cjs = fs.readFileSync(path.join(smolDir, "dist", "index.cjs"), "utf8");
const license = fs.readFileSync(path.join(smolDir, "LICENSE"), "utf8").trim();

const repoUrl = (pkg.repository && pkg.repository.url) || "https://github.com/squirrelchat/smol-toml";
const header = [
  "/*",
  ` * Vendored from smol-toml@${pkg.version} (${repoUrl})`,
  " * Self-contained CommonJS build (dist/index.cjs), zero runtime dependencies.",
  " * Committed so codex-hud can require('./vendor/toml.js') without a runtime npm",
  " * install (the patched-Codex launcher runs the HUD from a path with no",
  " * node_modules). Do not edit by hand; regenerate with: npm run vendor:toml",
  " *",
  ...license.split("\n").map((line) => (line ? " * " + line : " *")),
  " */",
  "",
].join("\n");

const outDir = path.join(repoRoot, "plugins", "codex-hud", "vendor");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "toml.js");
fs.writeFileSync(outPath, header + cjs, "utf8");
console.log(`wrote ${path.relative(repoRoot, outPath)} from smol-toml@${pkg.version}`);
