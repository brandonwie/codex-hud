#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const canonical = "https://codex-hud.brandonwie.dev/";
const requiredFiles = [
  "site/index.html",
  "site/styles.css",
  "site/app.js",
  "site/robots.txt",
  "site/sitemap.xml",
  "site/CNAME",
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
const cname = exists("site/CNAME") ? read("site/CNAME").trim() : "";
const workflow = exists(".github/workflows/pages.yml") ? read(".github/workflows/pages.yml") : "";
const readme = exists("README.md") ? read("README.md") : "";

const mustContain = [
  [html, `<link rel="canonical" href="${canonical}">`, "canonical link"],
  [html, 'rel="icon"', "favicon link"],
  [html, 'name="description"', "meta description"],
  [html, 'property="og:title"', "Open Graph title"],
  [html, 'property="og:image"', "Open Graph image"],
  [html, 'name="twitter:card"', "Twitter card"],
  [html, '"@type": "SoftwareApplication"', "SoftwareApplication schema"],
  [html, '"@type": "FAQPage"', "FAQ schema"],
  [html, 'id="hud-form"', "interactive form"],
  [html, 'id="hud-line"', "live HUD output"],
  [html, 'id="config-code"', "config output"],
  [html, "Codex HUD", "brand text"],
  [css, "--terminal", "terminal styling"],
  [css, "@media", "responsive CSS"],
  [js, "codex-hud.toml", "config generator"],
  [js, "navigator.clipboard", "copy behavior"],
  [robots, `Sitemap: ${canonical}sitemap.xml`, "robots sitemap"],
  [sitemap, `<loc>${canonical}</loc>`, "sitemap canonical URL"],
  [workflow, "pages: write", "Pages permission"],
  [workflow, "id-token: write", "OIDC permission"],
  [workflow, "github.ref == 'refs/heads/main'", "main-only Pages deploy guard"],
  [workflow, "site", "site artifact path"],
  [readme, canonical, "README canonical site link"],
  [readme, "assets/codex-hud-screenshot.png", "README screenshot"],
];

for (const [content, needle, label] of mustContain) {
  if (!content.includes(needle)) fail.push(`missing ${label}`);
}

if (cname !== "codex-hud.brandonwie.dev") {
  fail.push("CNAME must be codex-hud.brandonwie.dev");
}

const title = html.match(/<title>([^<]+)<\/title>/i);
if (!title || title[1].length < 20 || title[1].length > 65) {
  fail.push("title length must stay between 20 and 65 characters");
}

const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
if (!description || description[1].length < 120 || description[1].length > 170) {
  fail.push("description length must stay between 120 and 170 characters");
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

const pinnedActions = [
  "df4cb1c069e1874edd31b4311f1884172cec0e10",
  "983d7736d9b0ae728b81ab479565c72886d7745b",
  "7b1f4a764d45c48632c6b24a0339c27f5614fb0b",
  "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
];
for (const sha of pinnedActions) {
  if (!workflow.includes(sha)) fail.push(`workflow action is not pinned: ${sha}`);
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
  const element = {
    id,
    value: options.value || "",
    checked: Boolean(options.checked),
    textContent: options.textContent || "",
    style: {},
    classList: {
      toggle() {},
    },
    append(child) {
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
  return element;
};

const runInteractiveSmoke = () => {
  const elements = {
    model: createElement("model", { value: "gpt-5.5" }),
    effort: createElement("effort", { value: "xhigh" }),
    project: createElement("project", { value: "codex-hud" }),
    branch: createElement("branch", { value: "main*" }),
    "show-color": createElement("show-color", { checked: true }),
    "show-git": createElement("show-git", { checked: true }),
    "show-token-usage": createElement("show-token-usage", { checked: true }),
    "short-model": createElement("short-model"),
    "short-effort": createElement("short-effort"),
    context: createElement("context", { value: "32" }),
    "five-hour": createElement("five-hour", { value: "6" }),
    "seven-day": createElement("seven-day", { value: "4" }),
    "context-out": createElement("context-out"),
    "five-hour-out": createElement("five-hour-out"),
    "seven-day-out": createElement("seven-day-out"),
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
    "show-git",
    "show-token-usage",
    "short-model",
    "short-effort",
    "context",
    "five-hour",
    "seven-day",
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

  elements["short-effort"].checked = true;
  elements["short-effort"].dispatchEvent({ type: "change" });
  elements.context.value = "88";
  elements.context.dispatchEvent({ type: "input" });

  if (!elements["hud-line"].textContent.includes("gpt-5.5 xh")) {
    fail.push("interactive preview must update effortShort in HUD line");
  }
  if (!elements["hud-line"].textContent.includes("CTX:88%")) {
    fail.push("interactive preview must update context percentage");
  }
  if (!elements["config-code"].textContent.includes("effortShort = true")) {
    fail.push("interactive preview must update generated config");
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
