(() => {
  const byId = (id) => document.getElementById(id);
  const field = {
    model: byId("model"),
    effort: byId("effort"),
    project: byId("project"),
    branch: byId("branch"),
    color: byId("show-color"),
    space: byId("space"),
    separator: byId("separator"),
    segments: {
      model: byId("segment-model"),
      project: byId("segment-project"),
      branch: byId("segment-branch"),
      runtime: byId("segment-runtime"),
      ctx: byId("segment-ctx"),
      "5h": byId("segment-5h"),
      "7d": byId("segment-7d"),
      tkn: byId("segment-tkn"),
    },
    labelCtx: byId("label-ctx"),
    colorModel: byId("color-model"),
    colorBranch: byId("color-branch"),
    colorOk: byId("color-ok"),
    colorWarn: byId("color-warn"),
    colorCrit: byId("color-crit"),
    thresholdWarn: byId("threshold-warn"),
    thresholdCrit: byId("threshold-crit"),
    tokenUsage: byId("show-token-usage"),
    shortModel: byId("short-model"),
    shortEffort: byId("short-effort"),
    fastMode: byId("fast-mode"),
    serviceTier: byId("service-tier"),
    percentRound: byId("percent-round"),
    tokenUnits: byId("token-units"),
    pace: byId("show-pace"),
    pacePrefix: byId("pace-prefix"),
    paceSlowPrefix: byId("pace-slow-prefix"),
    paceNormalPrefix: byId("pace-normal-prefix"),
    paceFastPrefix: byId("pace-fast-prefix"),
    context: byId("context"),
    fiveHour: byId("five-hour"),
    sevenDay: byId("seven-day"),
    fiveHourPace: byId("five-hour-pace"),
    sevenDayPace: byId("seven-day-pace"),
  };

  const output = {
    form: byId("hud-form"),
    context: byId("context-out"),
    fiveHour: byId("five-hour-out"),
    sevenDay: byId("seven-day-out"),
    fiveHourPace: byId("five-hour-pace-out"),
    sevenDayPace: byId("seven-day-pace-out"),
    line: byId("hud-line"),
    heroLine: byId("hero-hud-line"),
    config: byId("config-code"),
    paceState: byId("pace-state"),
    copy: byId("copy-config"),
    copyStatus: byId("copy-status"),
    installCommand: byId("install-command"),
    copyInstall: byId("copy-install"),
    installCopyStatus: byId("install-copy-status"),
  };

  // Mirror rust/src/render.rs format_reasoning_effort():
  // effortShort abbreviates only xhigh; high/medium/low always render High/Med/Low.
  const formatEffort = (value, short) => {
    if (!value) return null;
    const normalized = String(value).trim();
    if (/^x[-_ ]?high$/i.test(normalized)) return short ? "xh" : "xhigh";
    if (/^high$/i.test(normalized)) return "High";
    if (/^medium$/i.test(normalized)) return "Med";
    if (/^low$/i.test(normalized)) return "Low";
    return normalized;
  };

  const tokenPreview = {
    total: 42000,
    input: 24000,
    output: 1000,
    cache: 17000,
  };
  const runtimePreview = {
    label: "node",
    version: "v24",
  };

  const palette = {
    dim: "#8f9abc",
    coral: "#ff7f86",
    mint: "#7ed6a8",
    amber: "#f2bc66",
    cyan: "#00d7ff",
    violet: "#b79aff",
    neonViolet: "#b79aff",
  };

  const defaultSegments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"];
  const orderedSegments = ["model", "project", "branch", "runtime", "ctx", "5h", "7d", "tkn"];

  // Mirror of default_config().thresholds.pace.crit in rust/src/hudcfg.rs
  // (read at runtime by pace_state_prefix).
  // The static playground can't load the plugin config, so keep this value in sync by hand.
  const PACE_CRIT = 15;

  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  };

  const readText = (element, fallback) => {
    const value = String(element && element.value ? element.value : "").trim();
    return value || fallback;
  };

  const readBool = (element, fallback) => (element ? Boolean(element.checked) : fallback);

  const shortModel = (value) => value.replace(/^gpt-/, "");

  const clean = (value, fallback) => {
    const next = String(value || "").trim().replace(/\s+/g, "-");
    return next || fallback;
  };

  const readSegments = () => {
    const selected = orderedSegments.filter((segment) => readBool(field.segments[segment], defaultSegments.includes(segment)));
    return selected.length > 0 ? selected : defaultSegments.slice();
  };

  const ansi256 = (code) => {
    const value = Number(code);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    const base = [
      "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
      "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
    ];
    if (value < 16) return base[value];
    if (value >= 232) {
      const level = 8 + ((value - 232) * 10);
      const hex = level.toString(16).padStart(2, "0");
      return `#${hex}${hex}${hex}`;
    }
    const index = value - 16;
    const scale = [0, 95, 135, 175, 215, 255];
    const red = scale[Math.floor(index / 36) % 6];
    const green = scale[Math.floor(index / 6) % 6];
    const blue = scale[index % 6];
    return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  };

  const resolveColor = (value, fallback) => {
    const text = String(value || "").trim();
    if (palette[text]) return palette[text];
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
    const ansi = ansi256(text);
    return ansi || palette[fallback] || fallback;
  };

  const percentClass = (value, state) => {
    if (value >= state.thresholdCrit) return "crit";
    if (value >= state.thresholdWarn) return "warn";
    return "ok";
  };

  const formatPercent = (value, state) => (
    `${state.percentRound ? Math.round(value) : Math.round(value * 10) / 10}%`
  );

  const formatToken = (value, state) => {
    if (!state.tokenUnits) return String(value);
    if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
    if (value >= 1000) return `${Math.round(value / 1000)}k`;
    return String(value);
  };

  const remaining = (value, hours) => {
    const left = ((100 - value) / 100) * hours;
    const amount = hours > 24 ? left / 24 : left;
    const unit = hours > 24 ? "d" : "h";
    return `${amount.toFixed(1).replace(/\.0$/, "")}${unit}`;
  };

  const paceDetail = (value, used, state) => {
    const pace = clamp(value, 0, 100, 0);
    // Port of paceStatePrefix(): the marker keys off (usedPercent - pacePercent),
    // not the pace value alone. Number respects format.percentRound like the plugin.
    const diff = used - pace;
    const marker = diff < -PACE_CRIT
      ? state.paceSlowPrefix
      : diff > PACE_CRIT
        ? state.paceFastPrefix
        : state.paceNormalPrefix;
    const prefix = state.pacePrefix ? marker : "";
    return `${prefix}${formatPercent(pace, state)}`;
  };

  const setColor = (span, state, colorKey) => {
    if (!state.color || !colorKey) return;
    const value = state.previewColors[colorKey];
    if (value) span.style.color = value;
  };

  const append = (line, text, className, state, colorKey) => {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) span.className = className;
    setColor(span, state, colorKey || className);
    line.append(span);
  };

  const appendSeparator = (line, state) => {
    const text = state.space ? ` ${state.separator} ` : state.separator;
    append(line, text, "separator", state, "label");
  };

  const appendMetric = (line, label, percent, detail, state) => {
    const labelSeparator = state.space ? ": " : ":";
    const colorKey = percentClass(percent, state);
    append(line, label, "label", state, "label");
    append(line, labelSeparator, "label", state, "label");
    append(line, formatPercent(percent, state), colorKey, state, colorKey);
    if (!detail) return;
    append(line, "(", "label", state, "label");
    append(line, detail.remaining, "detail", state, "label");
    if (state.pace) {
      append(line, ",", "label", state, "label");
      append(line, detail.pace, "pace", state, "pace");
    }
    append(line, ")", "label", state, "label");
  };

  const appendBranch = (line, state) => {
    const dirty = state.branch.endsWith("*");
    const branch = dirty ? state.branch.slice(0, -1) : state.branch;
    append(line, "git(", "label", state, "label");
    append(line, branch, "branch", state, "branch");
    if (dirty) append(line, "*", "dirty", state, "dirty");
    append(line, ")", "label", state, "label");
  };

  const appendTokenUsage = (line, state) => {
    const labelSeparator = state.space ? ": " : ":";
    append(line, "Tkn", "label", state, "label");
    append(line, labelSeparator, "label", state, "label");
    append(line, formatToken(tokenPreview.total, state), "token-total", state, "tokenTotal");
    if (!state.tokenUsage) return;
    append(line, "(", "label", state, "label");
    append(line, "I:", "label", state, "label");
    append(line, formatToken(tokenPreview.input, state), "token-value", state, "tokenInput");
    append(line, ",O:", "label", state, "label");
    append(line, formatToken(tokenPreview.output, state), "token-value", state, "tokenOutput");
    append(line, ",C:", "label", state, "label");
    append(line, formatToken(tokenPreview.cache, state), "token-value", state, "tokenCache");
    append(line, ")", "label", state, "label");
  };

  const renderSegment = (line, segment, state) => {
    if (segment === "model") {
      append(line, `${state.modelText}${state.effortText}`, "model", state, "model");
      if (state.fastActive) {
        appendSeparator(line, state);
        append(line, "f", "model", state, "model");
      }
      return true;
    }
    if (segment === "project") {
      append(line, state.project, "project", state, "project");
      return true;
    }
    if (segment === "branch") {
      appendBranch(line, state);
      return true;
    }
    if (segment === "runtime") {
      append(line, `${runtimePreview.label} ${runtimePreview.version}`, "runtime", state, "runtime");
      return true;
    }
    if (segment === "ctx") {
      appendMetric(line, state.labelCtx, state.context, null, state);
      return true;
    }
    if (segment === "5h") {
      appendMetric(line, "5h", state.fiveHour, {
        remaining: remaining(state.fiveHour, 5),
        pace: paceDetail(state.fiveHourPace, state.fiveHour, state),
      }, state);
      return true;
    }
    if (segment === "7d") {
      appendMetric(line, "7d", state.sevenDay, {
        remaining: remaining(state.sevenDay, 7 * 24),
        pace: paceDetail(state.sevenDayPace, state.sevenDay, state),
      }, state);
      return true;
    }
    if (segment === "tkn") {
      appendTokenUsage(line, state);
      return true;
    }
    return false;
  };

  const renderLine = (target, state) => {
    if (!target) return;
    target.textContent = "";
    target.classList.toggle("no-color", !state.color);

    let rendered = 0;
    for (const segment of state.segments) {
      if (rendered > 0) appendSeparator(target, state);
      if (renderSegment(target, segment, state)) rendered += 1;
    }
  };

  const tomlString = (value) => JSON.stringify(String(value));

  const configFor = (state) => [
    "# ~/.codex/codex-hud.toml",
    `space = ${state.space}`,
    `separator = ${tomlString(state.separator)}`,
    `segments = [${state.segments.map(tomlString).join(", ")}]`,
    "",
    "[labels]",
    `ctx = ${tomlString(state.labelCtx)}`,
    "",
    "[colors]",
    `model = ${tomlString(state.configColors.model)}`,
    `branch = ${tomlString(state.configColors.branch)}`,
    `ok = ${tomlString(state.configColors.ok)}`,
    `warn = ${tomlString(state.configColors.warn)}`,
    `crit = ${tomlString(state.configColors.crit)}`,
    "",
    "[thresholds.percent]",
    `warn = ${state.thresholdWarn}`,
    `crit = ${state.thresholdCrit}`,
    "",
    "[format]",
    `percentRound = ${state.percentRound}`,
    `tokenUnits = ${state.tokenUnits}`,
    `tokenUsage = ${state.tokenUsage}`,
    `pace = ${state.pace}`,
    `pacePrefix = ${state.pacePrefix}`,
    `modelShort = ${state.shortModel}`,
    `effortShort = ${state.shortEffort}`,
    `fastMode = ${state.fastMode}`,
    `paceSlowPrefix = ${tomlString(state.paceSlowPrefix)}`,
    `paceNormalPrefix = ${tomlString(state.paceNormalPrefix)}`,
    `paceFastPrefix = ${tomlString(state.paceFastPrefix)}`,
  ].join("\n");

  const readState = () => {
    const model = readText(field.model, "gpt-5.5");
    const effort = readText(field.effort, "xhigh");
    const shortModelEnabled = readBool(field.shortModel, true);
    const shortEffortEnabled = readBool(field.shortEffort, false);
    // Fast marker: Codex service_tier="fast" auto-detect, OR the manual fastMode override.
    const fastModeOverride = readBool(field.fastMode, false);
    const fastActive = readText(field.serviceTier, "standard") === "fast" || fastModeOverride;
    const configColors = {
      model: readText(field.colorModel, "neonViolet"),
      branch: readText(field.colorBranch, "neonViolet"),
      ok: readText(field.colorOk, "mint"),
      warn: readText(field.colorWarn, "amber"),
      crit: readText(field.colorCrit, "coral"),
    };
    return {
      model,
      effort,
      modelText: shortModelEnabled ? shortModel(model) : model,
      effortText: formatEffort(effort, shortEffortEnabled),
      project: clean(field.project && field.project.value, "codex-hud"),
      branch: clean(field.branch && field.branch.value, "main"),
      color: readBool(field.color, true),
      space: readBool(field.space, false),
      separator: readText(field.separator, "|"),
      segments: readSegments(),
      labelCtx: readText(field.labelCtx, "Ctx"),
      configColors,
      previewColors: {
        model: resolveColor(configColors.model, "neonViolet"),
        project: palette.cyan,
        branch: resolveColor(configColors.branch, "neonViolet"),
        runtime: palette.dim,
        dirty: palette.amber,
        label: palette.dim,
        tokenTotal: palette.amber,
        tokenInput: palette.cyan,
        tokenOutput: palette.cyan,
        tokenCache: palette.cyan,
        tokenValue: palette.cyan,
        pace: palette.mint,
        ok: resolveColor(configColors.ok, "mint"),
        warn: resolveColor(configColors.warn, "amber"),
        crit: resolveColor(configColors.crit, "coral"),
      },
      thresholdWarn: clamp(field.thresholdWarn && field.thresholdWarn.value, 0, 100, 70),
      thresholdCrit: clamp(field.thresholdCrit && field.thresholdCrit.value, 0, 100, 90),
      percentRound: readBool(field.percentRound, true),
      tokenUnits: readBool(field.tokenUnits, true),
      tokenUsage: readBool(field.tokenUsage, true),
      pace: readBool(field.pace, true),
      pacePrefix: readBool(field.pacePrefix, true),
      shortModel: shortModelEnabled,
      shortEffort: shortEffortEnabled,
      fastMode: fastModeOverride,
      fastActive,
      paceSlowPrefix: readText(field.paceSlowPrefix, "🐢"),
      paceNormalPrefix: readText(field.paceNormalPrefix, "👾"),
      paceFastPrefix: readText(field.paceFastPrefix, "🔥"),
      context: clamp(field.context && field.context.value, 0, 100, 32),
      fiveHour: clamp(field.fiveHour && field.fiveHour.value, 0, 100, 6),
      sevenDay: clamp(field.sevenDay && field.sevenDay.value, 0, 100, 4),
      fiveHourPace: clamp(field.fiveHourPace && field.fiveHourPace.value, 0, 100, 20),
      sevenDayPace: clamp(field.sevenDayPace && field.sevenDayPace.value, 0, 100, 13),
    };
  };

  const render = () => {
    const state = readState();
    if (output.context) output.context.textContent = formatPercent(state.context, state);
    if (output.fiveHour) output.fiveHour.textContent = formatPercent(state.fiveHour, state);
    if (output.sevenDay) output.sevenDay.textContent = formatPercent(state.sevenDay, state);
    if (output.fiveHourPace) output.fiveHourPace.textContent = `${Math.round(state.fiveHourPace)}%`;
    if (output.sevenDayPace) output.sevenDayPace.textContent = `${Math.round(state.sevenDayPace)}%`;
    if (output.paceState) {
      const fiveDiff = state.fiveHour - state.fiveHourPace;
      const sevenDiff = state.sevenDay - state.sevenDayPace;
      const pace = !state.pace
        ? "pace hidden"
        : fiveDiff > PACE_CRIT || sevenDiff > PACE_CRIT
          ? "fast pace"
          : fiveDiff < -PACE_CRIT || sevenDiff < -PACE_CRIT
            ? "slow pace"
            : "normal pace";
      output.paceState.textContent = pace;
    }
    renderLine(output.line, state);
    renderLine(output.heroLine, state);
    if (output.config) output.config.textContent = configFor(state);
  };

  const copyText = async (text, status) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      if (status) status.textContent = "Copied.";
    } catch (error) {
      if (status) status.textContent = "Copy failed.";
    }
  };

  const copyConfig = async () => {
    if (!output.config) return;
    await copyText(output.config.textContent || "", output.copyStatus);
  };

  const copyInstall = async () => {
    if (!output.installCommand) return;
    await copyText(output.installCommand.textContent || "", output.installCopyStatus);
  };

  const bindCommandCopyButtons = () => {
    document.querySelectorAll("[data-copy-target]").forEach((button) => {
      const target = byId(button.getAttribute("data-copy-target"));
      const status = byId(button.getAttribute("data-copy-status"));
      if (!target) return;
      button.addEventListener("click", () => copyText(target.textContent || "", status));
    });
  };

  document.querySelectorAll("[data-setting]").forEach((element) => {
    element.addEventListener("input", render);
    element.addEventListener("change", render);
  });
  if (output.form) {
    output.form.addEventListener("input", render);
    output.form.addEventListener("change", render);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pageshow", render);
  }

  if (output.copy) {
    output.copy.addEventListener("click", copyConfig);
  }
  if (output.copyInstall) {
    output.copyInstall.addEventListener("click", copyInstall);
  }
  bindCommandCopyButtons();

  render();
  if (typeof window !== "undefined" && window.requestAnimationFrame) {
    window.requestAnimationFrame(render);
  }
})();
