#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonical = "https://brandonwie.github.io/codex-hud/";
const repositoryName = "brandonwie/codex-hud";
const unresolvedCustomHost = ["codex-hud", "brandonwie", "dev"].join(".");
const requiredFiles = [
  "site/index.html",
  "site/styles.css",
  "site/app.js",
  "site/robots.txt",
  "site/sitemap.xml",
  "site/.nojekyll",
  "site/favicon.svg",
  "assets/codex-hud-screenshot.png",
  "site/assets/codex-hud-screenshot.png",
  ".github/workflows/pages.yml",
];

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const fail = [];

for (const file of requiredFiles) {
  if (!exists(file)) fail.push(`missing ${file}`);
}

const html = exists("site/index.html") ? read("site/index.html") : "";
const css = exists("site/styles.css") ? read("site/styles.css") : "";
const js = exists("site/app.js") ? read("site/app.js") : "";
const robots = exists("site/robots.txt") ? read("site/robots.txt") : "";
const sitemap = exists("site/sitemap.xml") ? read("site/sitemap.xml") : "";
const workflow = exists(".github/workflows/pages.yml") ? read(".github/workflows/pages.yml") : "";
const readme = exists("README.md") ? read("README.md") : "";

const mustContain = [
  [html, `<link rel="canonical" href="${canonical}">`, "canonical link"],
  [html, 'name="author"', "author meta"],
  [html, 'rel="author"', "author link"],
  [html, 'rel="me"', "identity link"],
  [html, 'rel="icon"', "favicon link"],
  [html, 'name="description"', "meta description"],
  [html, 'property="og:title"', "Open Graph title"],
  [html, 'property="og:image"', "Open Graph image"],
  [html, 'name="twitter:card"', "Twitter card"],
  [html, '"@type": "SoftwareApplication"', "SoftwareApplication schema"],
  [html, '"@type": "FAQPage"', "FAQ schema"],
  [html, 'id="hud-form"', "interactive form"],
  [html, 'aria-describedby="settings-help"', "form accessible description"],
  [html, 'id="hud-line"', "live HUD output"],
  [html, 'aria-label="Generated Codex HUD status line"', "HUD output accessible label"],
  [html, 'id="config-code"', "config output"],
  [html, 'class="skip-link"', "skip link"],
  [html, 'id="main-content"', "main skip target"],
  [html, '<noscript>', "noscript fallback"],
  [html, "Codex HUD", "brand text"],
  [html, '"downloadUrl": "https://github.com/brandonwie/codex-hud"', "schema download URL"],
  [html, '"installUrl": "https://github.com/brandonwie/codex-hud#quick-start"', "schema install URL"],
  [css, "--terminal", "terminal styling"],
  [css, "@media", "responsive CSS"],
  [css, ".skip-link", "skip link styling"],
  [css, ":focus-visible", "visible focus styling"],
  [css, "prefers-reduced-motion", "reduced motion preference"],
  [css, "prefers-contrast: more", "high contrast preference"],
  [css, ".sr-only", "screen-reader-only helper"],
  [js, "codex-hud.toml", "config generator"],
  [js, "navigator.clipboard", "copy behavior"],
  [robots, `Sitemap: ${canonical}sitemap.xml`, "robots sitemap"],
  [sitemap, `<loc>${canonical}</loc>`, "sitemap canonical URL"],
  [workflow, "contents: write", "gh-pages publish permission"],
  [workflow, "github.ref == 'refs/heads/main'", "main-only Pages deploy guard"],
  [workflow, "PAGES_BRANCH: gh-pages", "gh-pages publish branch"],
  [workflow, "rsync -a --exclude CNAME site/", "site branch publish command"],
  [readme, canonical, "README canonical site link"],
  [readme, "assets/codex-hud-screenshot.png", "README screenshot"],
  [html, "https://herdr.dev/", "Herdr credit link"],
  [html, "I'm a huge fan", "Herdr fan note"],
  [html, repositoryName, "exact owner/repo search phrase"],
];

for (const [content, needle, label] of mustContain) {
  if (!content.includes(needle)) fail.push(`missing ${label}`);
}

const pkgVersion = JSON.parse(read("package.json")).version;
const siteVersion = html.match(/"softwareVersion":\s*"([^"]+)"/);
if (!siteVersion) {
  fail.push("site JSON-LD must declare softwareVersion");
} else if (siteVersion[1] !== pkgVersion) {
  fail.push(`site softwareVersion ${siteVersion[1]} must match package.json ${pkgVersion}`);
}

if (!js.includes('readText(field.colorBranch, "neonViolet")')) {
  fail.push("playground branch color must default to neonViolet (plugin DEFAULT_CONFIG)");
}
if (html.includes('id="color-branch"') && html.includes('value="#5fafff"')) {
  fail.push("site branch color must default to neonViolet, not a hex demo");
}

const readmeConfigControls = [
  ["space", "space"],
  ["separator", "separator"],
  ["segments.model", "segment-model"],
  ["segments.project", "segment-project"],
  ["segments.branch", "segment-branch"],
  ["segments.runtime", "segment-runtime"],
  ["segments.ctx", "segment-ctx"],
  ["segments.5h", "segment-5h"],
  ["segments.7d", "segment-7d"],
  ["segments.tkn", "segment-tkn"],
  ["labels.ctx", "label-ctx"],
  ["colors.model", "color-model"],
  ["colors.branch", "color-branch"],
  ["colors.ok", "color-ok"],
  ["colors.warn", "color-warn"],
  ["colors.crit", "color-crit"],
  ["thresholds.percent.warn", "threshold-warn"],
  ["thresholds.percent.crit", "threshold-crit"],
  ["format.percentRound", "percent-round"],
  ["format.tokenUnits", "token-units"],
  ["format.tokenUsage", "show-token-usage"],
  ["format.pace", "show-pace"],
  ["format.pacePrefix", "pace-prefix"],
  ["format.modelShort", "short-model"],
  ["format.effortShort", "short-effort"],
  ["format.fastMode", "fast-mode"],
  ["format.paceSlowPrefix", "pace-slow-prefix"],
  ["format.paceNormalPrefix", "pace-normal-prefix"],
  ["format.paceFastPrefix", "pace-fast-prefix"],
];

for (const [setting, id] of readmeConfigControls) {
  if (!html.includes(`id="${id}"`)) fail.push(`missing site control for ${setting}`);
  if (!js.includes(`byId("${id}")`)) fail.push(`site app does not read ${setting}`);
}

for (const id of ["five-hour-pace", "seven-day-pace", "five-hour-pace-out", "seven-day-pace-out"]) {
  if (!html.includes(`id="${id}"`)) fail.push(`missing pace control ${id}`);
}

if (html.includes('id="runtime"') || js.includes('byId("runtime")')) {
  fail.push("website must not expose runtime as a text input");
}

if (exists("site/CNAME")) {
  fail.push("site/CNAME must stay absent until custom-domain DNS resolves");
}

if (
  html.includes(unresolvedCustomHost) ||
  robots.includes(unresolvedCustomHost) ||
  sitemap.includes(unresolvedCustomHost) ||
  readme.includes(unresolvedCustomHost)
) {
  fail.push("SEO metadata must not point at unresolved custom domain");
}

const title = html.match(/<title>([^<]+)<\/title>/i);
if (!title || title[1].length < 20 || title[1].length > 65) {
  fail.push("title length must stay between 20 and 65 characters");
} else if (!title[1].includes(repositoryName)) {
  fail.push("title must include exact owner/repo search phrase");
}

const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
if (!description || description[1].length < 120 || description[1].length > 170) {
  fail.push("description length must stay between 120 and 170 characters");
} else if (!description[1].includes(repositoryName)) {
  fail.push("description must include exact owner/repo search phrase");
}

const sectionOpenCount = (html.match(/<section\b/g) || []).length;
const sectionCloseCount = (html.match(/<\/section>/g) || []).length;
if (sectionOpenCount !== sectionCloseCount) {
  fail.push(`section tags must be balanced (${sectionOpenCount} open, ${sectionCloseCount} close)`);
}

const h1Count = (html.match(/<h1\b/g) || []).length;
if (h1Count !== 1) {
  fail.push(`site must have exactly one h1 (${h1Count})`);
}

const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
for (const match of jsonLdBlocks) {
  try {
    JSON.parse(match[1]);
  } catch (error) {
    fail.push(`invalid JSON-LD: ${error.message}`);
  }
}

const readAttrs = (tag) => {
  const attrs = {};
  for (const match of tag.matchAll(/\s([^\s=/>]+)(?:\s*=\s*"([^"]*)")?/g)) {
    attrs[match[1].toLowerCase()] = match[2] || "";
  }
  return attrs;
};

for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
  const attrs = readAttrs(match[0]);
  if (!("alt" in attrs)) fail.push(`image missing alt text: ${match[0].slice(0, 80)}`);
}

const externalScript = [...html.matchAll(/<script\b[^>]*>/gi)]
  .some((match) => /^https?:\/\//i.test(readAttrs(match[0]).src || ""));
const externalStylesheet = [...html.matchAll(/<link\b[^>]*>/gi)].some((match) => {
  const attrs = readAttrs(match[0]);
  return /\bstylesheet\b/i.test(attrs.rel || "") && /^https?:\/\//i.test(attrs.href || "");
});
if (externalScript || externalStylesheet) {
  fail.push("site must not load remote scripts or stylesheets");
}

if (/(?:src|href)="\/(?!\/)/.test(html)) {
  fail.push("local asset paths must be relative for project-page compatibility");
}

if (/letter-spacing:\s*-[0-9.]/.test(css)) {
  fail.push("CSS must not use negative letter spacing");
}

const actionRefs = [...workflow.matchAll(/uses:\s*[^@\s]+@([^\s#]+)/g)].map((match) => match[1]);
if (actionRefs.length === 0) {
  fail.push("workflow must use at least one pinned action");
}
for (const ref of actionRefs) {
  if (!/^[a-f0-9]{40}$/.test(ref)) fail.push(`workflow action is not pinned to a SHA: ${ref}`);
}

if (/deploy-pages|upload-pages-artifact|configure-pages/.test(workflow)) {
  fail.push("workflow must publish gh-pages branch, not switch Pages to Actions deploy");
}

const hashFile = (relativePath) => crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(root, relativePath)))
  .digest("hex");
if (
  exists("assets/codex-hud-screenshot.png") &&
  exists("site/assets/codex-hud-screenshot.png") &&
  hashFile("assets/codex-hud-screenshot.png") !== hashFile("site/assets/codex-hud-screenshot.png")
) {
  fail.push("README and site screenshots must stay byte-identical");
}

const createElement = (id, options = {}) => {
  const listeners = {};
  let text = options.textContent || "";
  const element = {
    id,
    value: options.value || "",
    checked: Boolean(options.checked),
    className: options.className || "",
    children: [],
    style: {},
    classList: {
      toggle() {},
    },
    append(child) {
      if (child) this.children.push(child);
      this.textContent += child && child.textContent ? child.textContent : "";
    },
    addEventListener(type, listener) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners[event.type] || []) listener.call(this, event);
    },
    setAttribute() {},
    select() {},
    remove() {},
  };
  Object.defineProperty(element, "textContent", {
    get() {
      return text;
    },
    set(value) {
      text = String(value);
      if (text === "") this.children = [];
    },
  });
  return element;
};

const runInteractiveSmoke = () => {
  const elements = {
    "hud-form": createElement("hud-form"),
    model: createElement("model", { value: "gpt-5.5" }),
    effort: createElement("effort", { value: "xhigh" }),
    project: createElement("project", { value: "codex-hud" }),
    branch: createElement("branch", { value: "main*" }),
    "show-color": createElement("show-color", { checked: true }),
    space: createElement("space"),
    separator: createElement("separator", { value: "|" }),
    "segment-model": createElement("segment-model", { checked: true }),
    "segment-project": createElement("segment-project", { checked: true }),
    "segment-branch": createElement("segment-branch", { checked: true }),
    "segment-runtime": createElement("segment-runtime"),
    "segment-ctx": createElement("segment-ctx", { checked: true }),
    "segment-5h": createElement("segment-5h", { checked: true }),
    "segment-7d": createElement("segment-7d", { checked: true }),
    "segment-tkn": createElement("segment-tkn", { checked: true }),
    "label-ctx": createElement("label-ctx", { value: "Ctx" }),
    "color-model": createElement("color-model", { value: "neonViolet" }),
    "color-branch": createElement("color-branch", { value: "#5fafff" }),
    "color-ok": createElement("color-ok", { value: "mint" }),
    "color-warn": createElement("color-warn", { value: "amber" }),
    "color-crit": createElement("color-crit", { value: "coral" }),
    "threshold-warn": createElement("threshold-warn", { value: "70" }),
    "threshold-crit": createElement("threshold-crit", { value: "90" }),
    "show-token-usage": createElement("show-token-usage", { checked: true }),
    "short-model": createElement("short-model", { checked: true }),
    "short-effort": createElement("short-effort"),
    "fast-mode": createElement("fast-mode"),
    "percent-round": createElement("percent-round", { checked: true }),
    "token-units": createElement("token-units", { checked: true }),
    "show-pace": createElement("show-pace", { checked: true }),
    "pace-prefix": createElement("pace-prefix", { checked: true }),
    "pace-slow-prefix": createElement("pace-slow-prefix", { value: "🐢" }),
    "pace-normal-prefix": createElement("pace-normal-prefix", { value: "👾" }),
    "pace-fast-prefix": createElement("pace-fast-prefix", { value: "🔥" }),
    context: createElement("context", { value: "32" }),
    "five-hour": createElement("five-hour", { value: "6" }),
    "seven-day": createElement("seven-day", { value: "4" }),
    "five-hour-pace": createElement("five-hour-pace", { value: "20" }),
    "seven-day-pace": createElement("seven-day-pace", { value: "13" }),
    "context-out": createElement("context-out"),
    "five-hour-out": createElement("five-hour-out"),
    "seven-day-out": createElement("seven-day-out"),
    "five-hour-pace-out": createElement("five-hour-pace-out"),
    "seven-day-pace-out": createElement("seven-day-pace-out"),
    "hud-line": createElement("hud-line"),
    "hero-hud-line": createElement("hero-hud-line"),
    "config-code": createElement("config-code"),
    "pace-state": createElement("pace-state"),
    "copy-config": createElement("copy-config"),
    "copy-status": createElement("copy-status"),
  };
  const settingIds = [
    "model",
    "effort",
    "project",
    "branch",
    "show-color",
    "space",
    "separator",
    "segment-model",
    "segment-project",
    "segment-branch",
    "segment-runtime",
    "segment-ctx",
    "segment-5h",
    "segment-7d",
    "segment-tkn",
    "label-ctx",
    "color-model",
    "color-branch",
    "color-ok",
    "color-warn",
    "color-crit",
    "threshold-warn",
    "threshold-crit",
    "show-token-usage",
    "short-model",
    "short-effort",
    "fast-mode",
    "percent-round",
    "token-units",
    "show-pace",
    "pace-prefix",
    "pace-slow-prefix",
    "pace-normal-prefix",
    "pace-fast-prefix",
    "context",
    "five-hour",
    "seven-day",
    "five-hour-pace",
    "seven-day-pace",
  ];
  const document = {
    body: createElement("body"),
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      return selector === "[data-setting]" ? settingIds.map((id) => elements[id]) : [];
    },
    createElement(tag) {
      return createElement(tag);
    },
    execCommand() {
      return true;
    },
  };
  const context = {
    document,
    navigator: { clipboard: { writeText: async () => undefined } },
    Event: function Event(type) {
      this.type = type;
    },
  };
  vm.runInNewContext(js, context, { filename: "site/app.js" });

  const initialLine = elements["hud-line"].textContent;
  if (!/^5\.5xhigh\|codex-hud\|git\(main\*\)\|Ctx:32%\|5h:6%\(4\.7h,👾\d+%\)\|7d:4%\(6\.7d,👾\d+%\)\|Tkn:42k\(I:24k,O:1k,C:17k\)$/.test(initialLine)) {
    fail.push("interactive preview must match dense live HUD grammar");
  }
  if (/\b(?:CTX|5H|7D|TKN):/.test(initialLine)) {
    fail.push("interactive preview must preserve live label casing");
  }
  if (/ \| |: /.test(initialLine)) {
    fail.push("interactive preview must not show space=true separators by default");
  }

  const initialAtoms = elements["hud-line"].children.map((child) => [child.textContent, child.className]);
  const hasAtom = (text, className) => initialAtoms.some((atom) => atom[0] === text && atom[1] === className);
  if (!hasAtom("Ctx", "label") || !hasAtom("32%", "ok") || !hasAtom("|", "separator")) {
    fail.push("interactive preview must split labels, values, and separators into separate styled atoms");
  }
  if (initialAtoms.some((atom) => /^Ctx:\d+%$/.test(atom[0]))) {
    fail.push("interactive preview must not color an entire metric as one span");
  }

  elements.context.value = "88";
  elements.context.dispatchEvent({ type: "input" });

  if (!elements["hud-line"].textContent.includes("5.5xhigh|")) {
    fail.push("interactive preview must keep README model and effort defaults in HUD line");
  }
  if (!elements["hud-line"].textContent.includes("Ctx:88%")) {
    fail.push("interactive preview must update context percentage");
  }
  if (elements["hud-line"].textContent.includes("CTX:88%")) {
    fail.push("interactive preview must not regress to uppercase context label");
  }
  if (!elements["config-code"].textContent.includes("effortShort = false")) {
    fail.push("interactive preview must emit README effortShort default");
  }

  // M2: effort preview must mirror formatReasoningEffort (High/Med/Low; xh only for xhigh).
  elements.effort.value = "medium";
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5Med")) {
    fail.push("effort preview must render medium as Med like the plugin");
  }
  if (
    elements["hud-line"].textContent.includes("5.5medium") ||
    elements["hud-line"].textContent.includes("5.5md")
  ) {
    fail.push("effort preview must not lowercase or fake-abbreviate non-xhigh efforts");
  }
  elements["short-effort"].checked = true;
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5Med")) {
    fail.push("effortShort must abbreviate only xhigh, leaving Med unchanged");
  }
  elements["short-effort"].checked = false;
  elements.effort.value = "high";
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5High") || elements["hud-line"].textContent.includes("5.5hi")) {
    fail.push("effort preview must render high as High, not lowercase or abbreviated");
  }
  elements.effort.value = "low";
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5Low") || elements["hud-line"].textContent.includes("5.5lo")) {
    fail.push("effort preview must render low as Low, not lowercase or abbreviated");
  }
  elements.effort.value = "xhigh";
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5xhigh")) {
    fail.push("xhigh effort must render as xhigh when effortShort is false");
  }
  elements["short-effort"].checked = true;
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5xh")) {
    fail.push("xhigh effort must abbreviate to xh when effortShort is true");
  }
  elements["fast-mode"].checked = true;
  elements.effort.dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5.5xh|f|codex-hud")) {
    fail.push("fast mode must render f immediately after the model segment");
  }
  elements["fast-mode"].checked = false;
  elements.effort.dispatchEvent({ type: "input" });
  elements["short-effort"].checked = false;
  elements.effort.dispatchEvent({ type: "input" });

  elements["five-hour"].value = "35";
  elements["five-hour"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5h:35%(3.3h,👾20%)")) {
    fail.push("5h usage must not change the separate 5h pace percentage");
  }
  if (elements["hud-line"].textContent.includes("117%")) {
    fail.push("5h pace percentage must never be derived above 100 from usage");
  }
  if (elements["five-hour-pace-out"].textContent !== "20%") {
    fail.push("5h pace output must stay independent when only usage changes");
  }

  elements["five-hour-pace"].value = "87";
  elements["five-hour-pace"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5h:35%(3.3h,🐢87%)")) {
    fail.push("5h pace control must update pace independently from usage");
  }

  // F-R-4: lock the +/-PACE_CRIT (15) pace-marker boundary (inclusive normal band).
  elements["five-hour"].value = "20";
  elements["five-hour-pace"].value = "35";
  elements["hud-form"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5h:20%(4h,👾35%)")) {
    fail.push("pace diff of -15 must stay in the normal band (👾)");
  }
  elements["five-hour-pace"].value = "36";
  elements["hud-form"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5h:20%(4h,🐢36%)")) {
    fail.push("pace diff of -16 must cross into slow (🐢)");
  }
  elements["five-hour"].value = "36";
  elements["five-hour-pace"].value = "20";
  elements["hud-form"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("5h:36%(3.2h,🔥20%)")) {
    fail.push("pace diff of +16 must cross into fast (🔥)");
  }

  elements["segment-runtime"].checked = true;
  elements["hud-form"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("|node v24|")) {
    fail.push("runtime segment toggle must add auto-detected runtime text to the preview");
  }
  if (!elements["config-code"].textContent.includes('"runtime"')) {
    fail.push("runtime segment toggle must add runtime to generated config");
  }

  elements.space.checked = true;
  elements.separator.value = "·";
  elements["segment-runtime"].checked = false;
  elements["label-ctx"].value = "CTX";
  elements["threshold-warn"].value = "50";
  elements["threshold-crit"].value = "80";
  elements["percent-round"].checked = false;
  elements["token-units"].checked = false;
  elements["show-token-usage"].checked = false;
  elements["show-pace"].checked = false;
  elements["short-model"].checked = false;
  elements["short-effort"].checked = true;
  elements["fast-mode"].checked = true;
  elements["pace-slow-prefix"].value = "S";
  elements["pace-normal-prefix"].value = "N";
  elements["pace-fast-prefix"].value = "F";
  elements.context.value = "88";
  elements["five-hour"].value = "6";
  elements["five-hour-pace"].value = "20";
  elements["seven-day"].value = "4";
  elements["seven-day-pace"].value = "13";
  elements["hud-form"].dispatchEvent({ type: "input" });

  const customLine = elements["hud-line"].textContent;
  if (customLine.includes("node v24")) {
    fail.push("runtime segment must be removable with its checkbox");
  }
  if (!customLine.includes("gpt-5.5xh · f · codex-hud · git(main*) · CTX: 88%")) {
    fail.push("interactive preview must apply spacing, separator, labels, percent precision, and short effort controls");
  }
  if (!elements["hero-hud-line"].textContent.includes("gpt-5.5xh · f · codex-hud · git(main*) · CTX: 88%")) {
    fail.push("hero preview must apply the same panel settings as the result preview");
  }
  if (!customLine.includes("5h: 6%(4.7h)") || customLine.includes(",S") || customLine.includes(",N")) {
    fail.push("interactive preview must hide pace detail when format.pace is false");
  }
  if (!customLine.endsWith("Tkn: 42000")) {
    fail.push("interactive preview must show raw token total when tokenUnits/tokenUsage are false");
  }

  const customConfig = elements["config-code"].textContent;
  const expectedConfigSnippets = [
    "space = true",
    'separator = "·"',
    'segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]',
    'ctx = "CTX"',
    "warn = 50",
    "crit = 80",
    "percentRound = false",
    "tokenUnits = false",
    "tokenUsage = false",
    "pace = false",
    "modelShort = false",
    "effortShort = true",
    "fastMode = true",
    'paceSlowPrefix = "S"',
    'paceNormalPrefix = "N"',
    'paceFastPrefix = "F"',
  ];
  for (const snippet of expectedConfigSnippets) {
    if (!customConfig.includes(snippet)) fail.push(`generated config missing ${snippet}`);
  }

  elements["show-pace"].checked = true;
  elements["seven-day"].value = "34";
  elements["seven-day-pace"].value = "100";
  elements["hud-form"].dispatchEvent({ type: "input" });
  if (!elements["hud-line"].textContent.includes("7d: 34%(4.6d,S100%)")) {
    fail.push("7d pace control must stay separate from usage and cap at 100%");
  }
  if (elements["hud-line"].textContent.includes("113%")) {
    fail.push("7d pace percentage must never be derived above 100 from usage");
  }
};

try {
  runInteractiveSmoke();
} catch (error) {
  fail.push(`interactive preview smoke failed: ${error.message}`);
}

if (fail.length > 0) {
  console.error("site check failed:");
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}

console.log("site check passed");
