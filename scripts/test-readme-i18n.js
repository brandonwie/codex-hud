#!/usr/bin/env node
"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const checker = path.join(repoRoot, "scripts/check-readme-i18n.js");

function writeReadme(root, name, body) {
  fs.writeFileSync(path.join(root, name), body, "utf8");
}

function runChecker(root) {
  return childProcess.spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HUD_README_ROOT: root,
    },
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-readme-i18n-test-"));
try {
  const source = [
    "# Codex HUD",
    "",
    "## Install",
    "",
    "```sh",
    "npm install",
    "```",
    "",
    "## Troubleshooting",
    "",
  ].join("\n");

  writeReadme(tmp, "README.md", source);
  writeReadme(tmp, "README.de.md", `${source}\n\`\`\`broken\nunterminated\n`);
  writeReadme(tmp, "README.zh-TW.md", `${source}\n## Extra Drift\n`);

  const result = runChecker(tmp);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;

  assert.strictEqual(result.status, 1);
  assert.match(output, /README\.de\.md/);
  assert.match(output, /unclosed code fence/);
  assert.match(output, /README\.zh-TW\.md/);
  assert.match(output, /heading skeleton differs/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("readme i18n checker regression tests passed");
