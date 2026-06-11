#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const sourceFile = "README.md";
const localizedPattern = /^README\.[A-Za-z]{2}(?:-[A-Z]{2})?\.md$/;

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listLocalizedReadmes() {
  return fs.readdirSync(repoRoot).filter((name) => localizedPattern.test(name)).sort();
}

function skeletonFor(relativePath) {
  const lines = read(relativePath).split(/\r?\n/);
  const headings = [];
  const fences = [];
  let inFence = false;
  let fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^```\s*([^`]*)\s*$/.exec(line);

    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fence = {
          startLine: i + 1,
          info: (fenceMatch[1] || "").trim(),
          nonEmptyLineCount: 0,
        };
      } else {
        fences.push(fence);
        inFence = false;
        fence = null;
      }
      continue;
    }

    if (inFence) {
      if (line.trim()) {
        fence.nonEmptyLineCount += 1;
      }
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      headings.push({
        line: i + 1,
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
    }
  }

  if (inFence) {
    throw new Error(`${relativePath}: unclosed code fence starting at line ${fence.startLine}`);
  }

  return {
    headings,
    headingLevels: headings.map((heading) => heading.level),
    fences,
    fenceShape: fences.map((fence) => `${fence.info || "(plain)"}:${fence.nonEmptyLineCount}`),
  };
}

function formatHeadingContext(skeleton, index) {
  const heading = skeleton.headings[index];
  if (!heading) return "(missing)";
  return `line ${heading.line}: h${heading.level} ${heading.text}`;
}

function firstDifference(left, right) {
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if (left[i] !== right[i]) return i;
  }
  return -1;
}

function compareReadme(source, targetFile) {
  const target = skeletonFor(targetFile);
  const problems = [];

  const headingDiff = firstDifference(source.headingLevels, target.headingLevels);
  if (headingDiff !== -1) {
    problems.push(
      [
        `heading skeleton differs at position ${headingDiff + 1}`,
        `  ${sourceFile}: ${formatHeadingContext(source, headingDiff)}`,
        `  ${targetFile}: ${formatHeadingContext(target, headingDiff)}`,
        `  counts: ${source.headings.length} headings in ${sourceFile}, ${target.headings.length} in ${targetFile}`,
      ].join("\n"),
    );
  }

  const fenceDiff = firstDifference(source.fenceShape, target.fenceShape);
  if (fenceDiff !== -1) {
    problems.push(
      [
        `code-block skeleton differs at position ${fenceDiff + 1}`,
        `  ${sourceFile}: ${source.fenceShape[fenceDiff] || "(missing)"}`,
        `  ${targetFile}: ${target.fenceShape[fenceDiff] || "(missing)"}`,
        `  counts: ${source.fences.length} code blocks in ${sourceFile}, ${target.fences.length} in ${targetFile}`,
      ].join("\n"),
    );
  }

  return problems;
}

const localizedFiles = listLocalizedReadmes();
if (localizedFiles.length === 0) {
  throw new Error("No localized README files found");
}

const source = skeletonFor(sourceFile);
const failures = [];
for (const file of localizedFiles) {
  const problems = compareReadme(source, file);
  for (const problem of problems) {
    failures.push(`${file}\n${problem}`);
  }
}

if (failures.length > 0) {
  console.error(`Localized README drift detected in ${failures.length} file(s):\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`localized README skeletons OK (${localizedFiles.length} files)`);
