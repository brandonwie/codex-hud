#!/usr/bin/env node

// Runs a command with a deadline:
//
//   node scripts/run-with-deadline.js <seconds> <command> [args...]
//
// The command runs in its own process group. At the deadline the whole group
// gets SIGTERM, then SIGKILL after 10 seconds, and this script exits 124.
// Otherwise it exits with the command's status. SIGINT, SIGTERM and SIGHUP sent
// to this script go to the whole group.

const os = require("os");
const { spawn } = require("child_process");

const [secondsArg, command, ...args] = process.argv.slice(2);
const seconds = Number(secondsArg);
if (!command || !Number.isInteger(seconds) || seconds <= 0) {
  console.error("usage: node scripts/run-with-deadline.js <seconds> <command> [args...]");
  process.exit(2);
}

const child = spawn(command, args, { stdio: "inherit", detached: true });
let timedOut = false;

function signalGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group has already exited.
  }
}

const timer = setTimeout(() => {
  timedOut = true;
  console.error(`run-with-deadline: ${command} passed its ${seconds}s deadline; stopping it`);
  signalGroup("SIGTERM");
  setTimeout(() => signalGroup("SIGKILL"), 10_000).unref();
}, seconds * 1000);

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => signalGroup(signal));
}

child.on("error", (error) => {
  console.error(`run-with-deadline: ${error.message}`);
  process.exit(127);
});

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (timedOut) {
    signalGroup("SIGKILL");
    process.exit(124);
  }
  process.exit(code ?? 128 + (os.constants.signals[signal] || 0));
});
