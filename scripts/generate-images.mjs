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

// --- Shared: stylize the card mascot (illustrated, not raw photo). ---
// Card SVGs only (NOT iconSvg): slight desaturation + gentle posterize + warm
// bias + a soft accent rim-glow. Every primitive is verified to render cleanly
// in the installed librsvg (2.62.3 / cairo 1.18.4).
function catStyleFilter() {
  return `<filter id="catStyle" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="saturate" values="0.7" result="desat"/>
      <feComponentTransfer in="desat" result="post">
        <feFuncR type="discrete" tableValues="0.05 0.24 0.43 0.62 0.81 1"/>
        <feFuncG type="discrete" tableValues="0.05 0.24 0.43 0.62 0.81 1"/>
        <feFuncB type="discrete" tableValues="0.05 0.24 0.43 0.62 0.81 1"/>
      </feComponentTransfer>
      <feColorMatrix in="post" type="matrix" values="1.06 0.02 0 0 0.015  0.01 1.01 0 0 0.005  0 0 0.9 0 0  0 0 0 1 0" result="tinted"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="sil"/>
      <feFlood flood-color="${C.accent}" flood-opacity="0.85" result="rim"/>
      <feComposite in="rim" in2="sil" operator="in" result="rimSolid"/>
      <feGaussianBlur in="rimSolid" stdDeviation="3.5" result="glowEdge"/>
      <feMerge>
        <feMergeNode in="glowEdge"/>
        <feMergeNode in="tinted"/>
      </feMerge>
    </filter>`;
}

// --- Shared: the real compact HUD sample, two lines, no emoji (librsvg-safe). ---
// Mirrors the documented output shape (pipe segments, ":" labels, Tkn segment);
// pace shown without 🐢/👾 because rsvg-convert color-emoji is unreliable.
function hudSampleText(x, y, fs) {
  const lh = Math.round(fs * 1.55);
  const sep = `<tspan fill="${C.muted}">|</tspan>`;
  const line1 =
    `<tspan fill="${C.ink}">5.5xh</tspan>${sep}<tspan fill="${C.warn}">f</tspan>${sep}` +
    `<tspan fill="${C.accent}">codex-hud</tspan>${sep}` +
    `<tspan fill="${C.muted}">git(</tspan><tspan fill="${C.ink}">main</tspan><tspan fill="${C.muted}">)</tspan>${sep}` +
    `<tspan fill="${C.muted}">Ctx:</tspan><tspan fill="${C.ok}">28%</tspan>`;
  const line2 =
    `<tspan fill="${C.muted}">5h:</tspan><tspan fill="${C.ok}">24%</tspan><tspan fill="${C.muted}">(1.9h,63%)</tspan>${sep}` +
    `<tspan fill="${C.muted}">7d:</tspan><tspan fill="${C.ok}">34%</tspan><tspan fill="${C.muted}">(5.6d,20%)</tspan>${sep}` +
    `<tspan fill="${C.muted}">Tkn:</tspan><tspan fill="${C.ink}">478k</tspan><tspan fill="${C.muted}">(I:285k,O:5k)</tspan>`;
  return `<text x="${x}" y="${y}" font-family="${MONO}" font-weight="600" font-size="${fs}">${line1}</text>
  <text x="${x}" y="${y + lh}" font-family="${MONO}" font-weight="600" font-size="${fs}">${line2}</text>`;
}

// --- Open Graph hero: 1200x630, stylized cat left, wordmark + real sample. ---
function ogSvg() {
  const W = 1200;
  const H = 630;
  const catH = 281; // ~half the old 562 so the mascot no longer dominates
  const catW = Math.round(catH * CAT_RATIO); // ~240
  const catX = 70;
  const catY = Math.round((H - catH) / 2); // 175 (vertically centered)
  const tx = 344; // text column left edge (cat is smaller, so text moves left)
  const cx = catX + Math.round(catW / 2);
  const cy = catY + Math.round(catH / 2);
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
    ${catStyleFilter()}
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="none" stroke="${C.line}" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${cy}" rx="250" ry="250" fill="url(#glow)"/>
  <image xlink:href="${catHref}" x="${catX}" y="${catY}" width="${catW}" height="${catH}" preserveAspectRatio="xMidYMid meet" filter="url(#catStyle)"/>
  <text x="${tx}" y="250" font-family="${MONO}" font-weight="800" font-size="80" fill="${C.ink}"><tspan fill="${C.ok}">&gt;</tspan> codex-hud</text>
  <rect x="${tx + 2}" y="278" width="132" height="6" rx="3" fill="${C.accent}"/>
  <text x="${tx}" y="332" font-family="${MONO}" font-weight="500" font-size="30" fill="${C.muted}">Rust Codex CLI status footer</text>
  <line x1="${tx}" y1="390" x2="1140" y2="390" stroke="${C.line}" stroke-width="1"/>
  ${hudSampleText(tx, 436, 22)}
  <text x="${tx}" y="560" font-family="${MONO}" font-weight="500" font-size="22" fill="${C.muted}">github.com/brandonwie/codex-hud</text>
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
  const catH = 286; // ~half the old 571 so the mascot no longer dominates
  const catW = Math.round(catH * CAT_RATIO); // ~244
  const catX = 74;
  const catY = Math.round((H - catH) / 2); // 177 (vertically centered)
  const tx = 360; // text column left edge (cat is smaller, so text moves left)
  const cx = catX + Math.round(catW / 2);
  const cy = catY + Math.round(catH / 2);
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
    ${catStyleFilter()}
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="none" stroke="${C.line}" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${cy}" rx="255" ry="255" fill="url(#glow)"/>
  <image xlink:href="${catHref}" x="${catX}" y="${catY}" width="${catW}" height="${catH}" preserveAspectRatio="xMidYMid meet" filter="url(#catStyle)"/>
  <text x="${tx}" y="254" font-family="${MONO}" font-weight="800" font-size="80" fill="${C.ink}"><tspan fill="${C.ok}">&gt;</tspan> codex-hud</text>
  <rect x="${tx + 2}" y="282" width="141" height="6" rx="3" fill="${C.accent}"/>
  <text x="${tx}" y="336" font-family="${MONO}" font-weight="500" font-size="30" fill="${C.muted}">Rust Codex CLI status footer</text>
  <line x1="${tx}" y1="394" x2="1216" y2="394" stroke="${C.line}" stroke-width="1"/>
  ${hudSampleText(tx, 440, 22)}
  <text x="${tx}" y="566" font-family="${MONO}" font-weight="500" font-size="22" fill="${C.muted}">github.com/brandonwie/codex-hud</text>
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
