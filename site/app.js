(() => {
  const byId = (id) => document.getElementById(id);
  const field = {
    model: byId("model"),
    effort: byId("effort"),
    project: byId("project"),
    branch: byId("branch"),
    color: byId("show-color"),
    git: byId("show-git"),
    tokenUsage: byId("show-token-usage"),
    shortModel: byId("short-model"),
    shortEffort: byId("short-effort"),
    context: byId("context"),
    fiveHour: byId("five-hour"),
    sevenDay: byId("seven-day"),
  };

  const output = {
    context: byId("context-out"),
    fiveHour: byId("five-hour-out"),
    sevenDay: byId("seven-day-out"),
    line: byId("hud-line"),
    heroLine: byId("hero-hud-line"),
    config: byId("config-code"),
    paceState: byId("pace-state"),
    copy: byId("copy-config"),
    copyStatus: byId("copy-status"),
  };

  const shortEffort = {
    xhigh: "xh",
    high: "hi",
    medium: "md",
    low: "lo",
  };

  const shortModel = (value) => value.replace(/^gpt-/, "");
  const tokenPreview = {
    total: "42k",
    input: "24k",
    output: "1k",
    cache: "17k",
  };

  const clean = (value, fallback) => {
    const next = String(value || "").trim().replace(/\s+/g, "-");
    return next || fallback;
  };

  const percentClass = (value) => {
    if (value >= 90) return "crit";
    if (value >= 70) return "warn";
    return "ok";
  };

  const remaining = (value, hours) => {
    const left = ((100 - value) / 100) * hours;
    const amount = hours > 24 ? left / 24 : left;
    const unit = hours > 24 ? "d" : "h";
    return `${amount.toFixed(1).replace(/\.0$/, "")}${unit}`;
  };

  const paceDetail = (value) => {
    const prefix = value >= 70 ? "🔥" : value >= 30 ? "👾" : "🐢";
    return `${prefix}${Math.max(1, Math.round((value / 30) * 100))}%`;
  };

  const append = (line, text, className) => {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) span.className = className;
    line.append(span);
  };

  const appendSeparator = (line) => append(line, "|", "separator");

  const appendMetric = (line, label, percent, detail) => {
    append(line, label, "label");
    append(line, ":", "label");
    append(line, `${percent}%`, percentClass(percent));
    if (!detail) return;
    append(line, "(", "label");
    append(line, detail.remaining, "detail");
    append(line, ",", "label");
    append(line, detail.pace, "pace");
    append(line, ")", "label");
  };

  const appendTokenUsage = (line) => {
    append(line, "Tkn", "label");
    append(line, ":", "label");
    append(line, tokenPreview.total, "token-total");
    append(line, "(", "label");
    append(line, "I:", "label");
    append(line, tokenPreview.input, "token-value");
    append(line, ",O:", "label");
    append(line, tokenPreview.output, "token-value");
    append(line, ",C:", "label");
    append(line, tokenPreview.cache, "token-value");
    append(line, ")", "label");
  };

  const renderLine = (target, state) => {
    if (!target) return;
    target.textContent = "";
    target.classList.toggle("no-color", !state.color);

    append(target, `${state.modelText}${state.effortText}`, "model");

    if (state.git) {
      appendSeparator(target);
      append(target, state.project, "project");
      appendSeparator(target);
      const dirty = state.branch.endsWith("*");
      const branch = dirty ? state.branch.slice(0, -1) : state.branch;
      append(target, "git(", "label");
      append(target, branch, "branch");
      if (dirty) append(target, "*", "dirty");
      append(target, ")", "label");
    }

    appendSeparator(target);
    appendMetric(target, "Ctx", state.context);
    appendSeparator(target);
    appendMetric(target, "5h", state.fiveHour, {
      remaining: remaining(state.fiveHour, 5),
      pace: paceDetail(state.fiveHour),
    });
    appendSeparator(target);
    appendMetric(target, "7d", state.sevenDay, {
      remaining: remaining(state.sevenDay, 7 * 24),
      pace: paceDetail(state.sevenDay),
    });

    if (state.tokenUsage) {
      appendSeparator(target);
      appendTokenUsage(target);
    }
  };

  const configFor = (state) => {
    const segments = ["model"];
    if (state.git) segments.push("project", "branch");
    segments.push("ctx", "5h", "7d");
    if (state.tokenUsage) segments.push("tkn");

    return [
      "# ~/.codex/codex-hud.toml",
      "space = false",
      'separator = "|"',
      `segments = [${segments.map((item) => `"${item}"`).join(", ")}]`,
      "",
      "[colors]",
      'model = "neonViolet"',
      'project = "cyan"',
      'branch = "neonViolet"',
      'label = "dim"',
      'separator = "dim"',
      'tokenTotal = "amber"',
      'tokenInput = "cyan"',
      'tokenOutput = "cyan"',
      'tokenCache = "cyan"',
      'pace = "mint"',
      'ok = "mint"',
      'warn = "amber"',
      'crit = "coral"',
      "",
      "[thresholds.percent]",
      "warn = 70",
      "crit = 90",
      "",
      "[format]",
      "percentRound = true",
      "tokenUnits = true",
      `tokenUsage = ${state.tokenUsage}`,
      "pace = true",
      `modelShort = ${state.shortModel}`,
      `effortShort = ${state.shortEffort}`,
    ].join("\n");
  };

  const readState = () => {
    const model = field.model ? field.model.value : "gpt-5.5";
    const effort = field.effort ? field.effort.value : "xhigh";
    const shortModelEnabled = Boolean(field.shortModel && field.shortModel.checked);
    const shortEffortEnabled = Boolean(field.shortEffort && field.shortEffort.checked);
    return {
      model,
      effort,
      modelText: shortModelEnabled ? shortModel(model) : model,
      effortText: shortEffortEnabled ? shortEffort[effort] || effort : effort,
      project: clean(field.project && field.project.value, "codex-hud"),
      branch: clean(field.branch && field.branch.value, "main"),
      color: Boolean(field.color && field.color.checked),
      git: Boolean(field.git && field.git.checked),
      tokenUsage: Boolean(field.tokenUsage && field.tokenUsage.checked),
      shortModel: shortModelEnabled,
      shortEffort: shortEffortEnabled,
      context: Number(field.context && field.context.value) || 32,
      fiveHour: Number(field.fiveHour && field.fiveHour.value) || 6,
      sevenDay: Number(field.sevenDay && field.sevenDay.value) || 4,
    };
  };

  const render = () => {
    const state = readState();
    if (output.context) output.context.textContent = `${state.context}%`;
    if (output.fiveHour) output.fiveHour.textContent = `${state.fiveHour}%`;
    if (output.sevenDay) output.sevenDay.textContent = `${state.sevenDay}%`;
    if (output.paceState) {
      const pace = state.fiveHour > 70 || state.sevenDay > 70 ? "fast pace" : "normal pace";
      output.paceState.textContent = pace;
    }
    renderLine(output.line, state);
    renderLine(output.heroLine, state);
    if (output.config) output.config.textContent = configFor(state);
  };

  const copyConfig = async () => {
    if (!output.config) return;
    const text = output.config.textContent || "";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
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
      if (output.copyStatus) output.copyStatus.textContent = "Copied.";
    } catch (error) {
      if (output.copyStatus) output.copyStatus.textContent = "Copy failed.";
    }
  };

  document.querySelectorAll("[data-setting]").forEach((element) => {
    element.addEventListener("input", render);
    element.addEventListener("change", render);
  });

  if (output.copy) {
    output.copy.addEventListener("click", copyConfig);
  }

  render();
})();
