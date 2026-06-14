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
    return `${left.toFixed(1)}${hours > 24 ? "D" : "H"}`;
  };

  const append = (line, text, className) => {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) span.className = className;
    line.append(span);
  };

  const renderLine = (target, state) => {
    if (!target) return;
    target.textContent = "";
    target.classList.toggle("no-color", !state.color);

    append(target, state.modelText, "model");
    append(target, ` ${state.effortText}`, "effort");

    if (state.git) {
      append(target, " | ", "muted");
      append(target, `${state.project} git:(${state.branch})`, "git");
    }

    append(target, " | ", "muted");
    append(target, `CTX:${state.context}%`, percentClass(state.context));
    append(target, " | ", "muted");
    append(target, `5H:${state.fiveHour}%(${remaining(state.fiveHour, 5)})`, percentClass(state.fiveHour));
    append(target, " | ", "muted");
    append(target, `7D:${state.sevenDay}%(${remaining(state.sevenDay, 7 * 24)})`, percentClass(state.sevenDay));

    if (state.tokenUsage) {
      append(target, " | ", "muted");
      append(target, "TKN:42k", "ok");
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
      'branch = "#5fafff"',
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
