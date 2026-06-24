#!/usr/bin/env node
"use strict";

/**
 * Generate brand image assets for the site + metadata from the chacha brand master.
 *
 * Inputs:
 *   assets/brand/chacha.png   downscaled mascot master (transparent background)
 *   site/favicon.svg          geometric terminal mark (legible at small sizes)
 *
 * Outputs (all under site/):
 *   assets/og-image.png       1200x630  Open Graph + Twitter card  (cat hero)
 *   apple-touch-icon.png      180x180   iOS home screen            (cat face)
 *   icon-192.png              192x192   PWA / Android              (cat face)
 *   icon-512.png              512x512   PWA / Android              (cat face)
 *   favicon.ico               16/32/48  legacy favicon            (terminal mark)
 *
 * Deterministic: SVG composed in-process, rendered with rsvg-convert, raster
 * derivatives via sips. No network, no browser. Re-run after editing the master:
 *   node scripts/generate-images.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const site = path.join(root, "site");

// Brand palette (mirrors site/styles.css :root).
const C = {
  bg: "#080d18",
  panel: "#111827",
  ink: "#e7ebf7",
  muted: "#9aa7c7",
  line: "#28324d",
  accent: "#8db7ff",
  ok: "#7ed6a8",
  warn: "#f2bc66",
};

const MONO = "'JetBrains Mono','JetBrainsMono Nerd Font','DejaVu Sans Mono',monospace";

// Cat master as a data URI so the SVG is self-contained for rsvg-convert.
const catB64 = readFileSync(path.join(root, "assets/brand/chacha.png")).toString("base64");
const catHref = `data:image/png;base64,${catB64}`;
const CAT_RATIO = 1921 / 2253; // source width / height (preserved by downscale)

const tmp = mkdtempSync(path.join(tmpdir(), "codex-hud-img-"));

function renderSvg(svg, width, height, outPath) {
  const svgPath = path.join(tmp, "frame.svg");
  writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", ["-w", String(width), "-h", String(height), "-o", outPath, svgPath]);
}

function sipsResize(srcPath, size, outPath) {
  execFileSync("sips", ["-z", String(size), String(size), srcPath, "--out", outPath], { stdio: "ignore" });
}

// --- Open Graph hero: 1200x630, big cat left, wordmark + tagline right. ---
function ogSvg() {
  const W = 1200;
  const H = 630;
  const catH = 562;
  const catW = Math.round(catH * CAT_RATIO); // 479
  const catX = 58;
  const catY = 38;
  const tx = 578; // text column left edge
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1122"/>
      <stop offset="100%" stop-color="#070b15"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="none" stroke="${C.line}" stroke-width="2"/>
  <ellipse cx="300" cy="318" rx="312" ry="312" fill="url(#glow)"/>
  <image xlink:href="${catHref}" x="${catX}" y="${catY}" width="${catW}" height="${catH}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${tx}" y="252" font-family="${MONO}" font-weight="800" font-size="80" fill="${C.ink}"><tspan fill="${C.ok}">&gt;</tspan> codex-hud</text>
  <rect x="${tx + 2}" y="280" width="132" height="6" rx="3" fill="${C.accent}"/>
  <text x="${tx}" y="336" font-family="${MONO}" font-weight="500" font-size="30" fill="${C.muted}">Rust Codex CLI status footer</text>
  <line x1="${tx}" y1="398" x2="1140" y2="398" stroke="${C.line}" stroke-width="1"/>
  <text x="${tx}" y="450" font-family="${MONO}" font-weight="600" font-size="26"><tspan fill="${C.ink}">gpt-5</tspan><tspan fill="${C.muted}"> · </tspan><tspan fill="${C.accent}">main</tspan><tspan fill="${C.muted}"> · Ctx </tspan><tspan fill="${C.ok}">42%</tspan><tspan fill="${C.muted}"> · 5h </tspan><tspan fill="${C.ok}">12%</tspan><tspan fill="${C.muted}"> · 7d </tspan><tspan fill="${C.warn}">68%</tspan></text>
  <text x="${tx}" y="556" font-family="${MONO}" font-weight="500" font-size="22" fill="${C.muted}">github.com/brandonwie/codex-hud</text>
</svg>`;
}

// --- Square app icon: cat face filling the frame on brand background. ---
function iconSvg(size) {
  const S = size;
  const w = S * 1.18;
  const h = w / CAT_RATIO;
  const x = (S - w) / 2;
  const y = -S * 0.02;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="g" cx="50%" cy="46%" r="58%">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="frame"><rect width="${S}" height="${S}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${S}" height="${S}" fill="${C.bg}"/>
    <ellipse cx="${S / 2}" cy="${S * 0.46}" rx="${S * 0.6}" ry="${S * 0.6}" fill="url(#g)"/>
    <image xlink:href="${catHref}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>`;
}

// --- GitHub repo social preview: 1280x640 (2:1) for Settings -> Social preview. ---
function githubSocialSvg() {
  const W = 1280;
  const H = 640;
  const catH = 571;
  const catW = Math.round(catH * CAT_RATIO); // 487
  const catX = 62;
  const catY = 34;
  const tx = 617; // text column left edge
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1122"/>
      <stop offset="100%" stop-color="#070b15"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="none" stroke="${C.line}" stroke-width="2"/>
  <ellipse cx="320" cy="323" rx="317" ry="317" fill="url(#glow)"/>
  <image xlink:href="${catHref}" x="${catX}" y="${catY}" width="${catW}" height="${catH}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${tx}" y="256" font-family="${MONO}" font-weight="800" font-size="80" fill="${C.ink}"><tspan fill="${C.ok}">&gt;</tspan> codex-hud</text>
  <rect x="${tx + 2}" y="284" width="141" height="6" rx="3" fill="${C.accent}"/>
  <text x="${tx}" y="341" font-family="${MONO}" font-weight="500" font-size="30" fill="${C.muted}">Rust Codex CLI status footer</text>
  <line x1="${tx}" y1="404" x2="1216" y2="404" stroke="${C.line}" stroke-width="1"/>
  <text x="${tx}" y="457" font-family="${MONO}" font-weight="600" font-size="26"><tspan fill="${C.ink}">gpt-5</tspan><tspan fill="${C.muted}"> · </tspan><tspan fill="${C.accent}">main</tspan><tspan fill="${C.muted}"> · Ctx </tspan><tspan fill="${C.ok}">42%</tspan><tspan fill="${C.muted}"> · 5h </tspan><tspan fill="${C.ok}">12%</tspan><tspan fill="${C.muted}"> · 7d </tspan><tspan fill="${C.warn}">68%</tspan></text>
  <text x="${tx}" y="565" font-family="${MONO}" font-weight="500" font-size="22" fill="${C.muted}">github.com/brandonwie/codex-hud</text>
</svg>`;
}

// --- ICO container packing PNG-encoded entries (16/32/48). ---
function packIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const blobs = [];
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 0); // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.buf.length, o + 8); // byte size
    dir.writeUInt32LE(offset, o + 12); // offset
    offset += e.buf.length;
    blobs.push(e.buf);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

try {
  // OG card
  const ogOut = path.join(site, "assets/og-image.png");
  renderSvg(ogSvg(), 1200, 630, ogOut);
  console.log("wrote site/assets/og-image.png (1200x630)");

  // GitHub repo social preview (manual upload: Settings -> Social preview).
  const ghOut = path.join(root, "assets/github-social-preview.png");
  renderSvg(githubSocialSvg(), 1280, 640, ghOut);
  console.log("wrote assets/github-social-preview.png (1280x640)");

  // App icons: render 512 master, downscale derivatives.
  const icon512 = path.join(site, "icon-512.png");
  renderSvg(iconSvg(512), 512, 512, icon512);
  sipsResize(icon512, 192, path.join(site, "icon-192.png"));
  sipsResize(icon512, 180, path.join(site, "apple-touch-icon.png"));
  console.log("wrote site/icon-512.png, site/icon-192.png, site/apple-touch-icon.png");

  // favicon.ico from the geometric terminal mark (hybrid: mark stays tiny).
  const faviconSvg = readFileSync(path.join(site, "favicon.svg"), "utf8");
  const markSvgPath = path.join(tmp, "mark.svg");
  writeFileSync(markSvgPath, faviconSvg);
  const icoEntries = [16, 32, 48].map((size) => {
    const out = path.join(tmp, `mark-${size}.png`);
    execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", out, markSvgPath]);
    return { size, buf: readFileSync(out) };
  });
  writeFileSync(path.join(site, "favicon.ico"), packIco(icoEntries));
  console.log("wrote site/favicon.ico (16/32/48)");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
