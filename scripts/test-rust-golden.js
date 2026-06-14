#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "test-golden.js"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);

process.exit(result.status === null ? 1 : result.status);
