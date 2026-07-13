# Codex HUD Configuration Schema

**Schema version:** `5` (frozen) · **Status:** stable · **Source of truth:**
`default_config()` in `rust/src/hudcfg.rs`

This document freezes the `codex-hud.toml` configuration contract and the
output-formatting invariants that the Rust renderer MUST reproduce
byte-for-byte. `scripts/test-golden.js` enforces the captured fixtures in
`scripts/golden/`.

> When the contract changes, bump **Schema version**, update `default_config()`,
> and regenerate goldens (`npm run golden:update`) in the same commit. A change
> to rendered bytes without a schema-version bump is a regression.

## File discovery & merge

`codex-hud.toml` is resolved from the following sources. Later sources override
earlier ones; a missing or malformed file is ignored (the HUD falls back to
defaults and prints a one-line note on stderr — it never breaks the status
line).

1. Built-in defaults (`DEFAULT_CONFIG`).
2. `$CODEX_HOME/codex-hud.toml` (per-user; `$CODEX_HOME` defaults to `~/.codex`).
3. `./.codex/codex-hud.toml` (per-project; walks up to the git root).
4. `$CODEX_HUD_CONFIG` (explicit file path via env var).

**Merge semantics (frozen):**

- Merge is **per key, deep** for tables.
- **Arrays replace, never concatenate** — e.g. setting `segments` discards the
  default list entirely.
- Scalars override.
- Unknown `segments` ids are dropped with a warning; non-string entries dropped.

## Top-level keys

| Key          | Type       | Default (see below)      | Notes                                          |
| ------------ | ---------- | ------------------------ | ---------------------------------------------- |
| `segments`   | `string[]` | model…tkn (see Segments) | Order is significant. Arrays replace on merge. |
| `space`      | `bool`     | `false`                  | `true` → <code> &#124; </code> segment spacing + `: ` labels. |
| `separators` | table      | see Separators           | Glue strings between pieces.                   |
| `labels`     | table      | see Labels               | Per-segment / per-token label overrides.       |
| `colors`     | table      | see Colors               | Palette name, 0–255, or `#rrggbb`.             |
| `thresholds` | table      | see Thresholds           | Percent + pace color switch points.            |
| `format`     | table      | see Format               | Formatting toggles.                            |

### Segments

Valid ids (render in the order listed in `segments`):

`model`, `project`, `branch`, `runtime`, `ctx`, `5h`, `7d`, `tkn`

Aliases expanded before validation: `workspace` → `project,branch,runtime`;
`context` → `ctx`; `tokens` → `tkn`.

`runtime` (`node vX`) is available but **off by default** — add it to opt in.

`5h` and `7d` are filled from Codex's rate-limit windows matched by window
length (300 and 10080 minutes respectively) rather than by payload position;
a window that carries no length at all falls back to its own original payload
position, and only when that slot is still empty. When the payload omits a
window, that segment renders `?` instead of showing the other window's value.
A window with an unrecognized length is dropped entirely (it fills no slot),
so its segment also renders `?`.

### Separators

| Key          | Default | Meaning                                  |
| ------------ | ------- | ---------------------------------------- |
| `segment`    | <code>"&#124;"</code> | Between segments.                        |
| `tokenPart`  | `","`   | Between `I:`/`O:`/`C:` token parts.      |
| `labelValue` | `":"`   | Between a segment label and its value.   |
| `open`       | `"("`   | Opens a detail group (rate detail, tkn). |
| `close`      | `")"`   | Closes a detail group.                   |

When `space = true`: `segment` becomes `" " + segment.trim() + " "` and
`labelValue` becomes `labelValue.trimEnd() + " "`. Model, reasoning effort,
and non-default service tier are separate identity atoms, so the configured
segment separator is used between them too.

### Labels

| Key           | Default | Applies to              |
| ------------- | ------- | ----------------------- |
| `ctx`         | `"Ctx"` | context segment         |
| `5h`          | `"5h"`  | 5-hour rate segment     |
| `7d`          | `"7d"`  | 7-day rate segment      |
| `tkn`         | `"Tkn"` | token segment           |
| `tokenInput`  | `"I:"`  | token input sub-label   |
| `tokenOutput` | `"O:"`  | token output sub-label  |
| `tokenCache`  | `"C:"`  | token cache sub-label   |

A key matching a segment id overrides that segment's label.

### Colors

Each value is a **palette name**, a **256-color code** (`0`–`255`), or a
`#rrggbb` hex string (mapped to the nearest xterm-256 color — see Color mapping).

| Key                                       | Default        |
| ----------------------------------------- | -------------- |
| `model`                                   | `"neonViolet"` |
| `project`                                 | `"cyan"`       |
| `branch`                                  | `"neonViolet"` |
| `runtime`                                 | `"dim"`        |
| `dirty`                                   | `"amber"`      |
| `label`                                   | `"dim"`        |
| `separator`                               | `"dim"`        |
| `tokenTotal`                              | `"amber"`      |
| `tokenInput` / `tokenOutput` / `tokenCache` | `"cyan"`     |
| `pace`                                    | `"mint"`       |
| `ok` / `warn` / `crit`                    | `mint` / `amber` / `coral` |
| `none`                                    | `"dim"`        |

`ok` / `warn` / `crit` are the threshold colors shared by `ctx` / `5h` / `7d`.

**Named palette (frozen SGR codes):**

| Name         | xterm-256 | SGR                |
| ------------ | --------- | ------------------ |
| `dim`        | 245       | `\x1b[38;5;245m`   |
| `coral`      | 203       | `\x1b[38;5;203m`   |
| `mint`       | 85        | `\x1b[38;5;85m`    |
| `amber`      | 215       | `\x1b[38;5;215m`   |
| `cyan`       | 45        | `\x1b[38;5;45m`    |
| `violet`     | 135       | `\x1b[38;5;135m`   |
| `neonViolet` | 135       | `\x1b[38;5;135m`   |

> `neonViolet` and `violet` are **byte-identical** (both 135). This is
> intentional; a port MUST keep both names mapping to 135.

### Thresholds

| Key             | Default | Meaning                                |
| --------------- | ------- | -------------------------------------- |
| `percent.warn`  | `70`    | `ctx`/`5h`/`7d` ≥ warn → `warn` color. |
| `percent.crit`  | `90`    | ≥ crit → `crit` color.                 |
| `pace.warn`     | `0`     | Pace delta warn switch point.          |
| `pace.crit`     | `15`    | Pace delta crit switch point.          |

### Format

| Key            | Default | Meaning                                                  |
| -------------- | ------- | -------------------------------------------------------- |
| `percentRound` | `true`  | Round percentages to whole numbers.                      |
| `tokenUnits`   | `true`  | Use `k`/`M` abbreviation for token counts.               |
| `tokenUsage`   | `true`  | `false` → total only, hide `(I:.. O:.. C:..)`.           |
| `pace`         | `true`  | `false` → hide the pace `%` in `5h`/`7d`.                |
| `pacePrefix`   | `true`  | `false` → hide the pace icon (🐢/👾/🔥), keep the `%`.   |
| `identityShort` | `true` | `true` → `5.6-sol|h|f`; `false` → `gpt-5.6-sol|high|fast`. |
| `fastMode`     | `false` | `true` → force the fast service-tier atom (manual override). |
| `paceSlowPrefix` | `"🐢"` | Prefix when usage is more than `pace.crit` behind pace. |
| `paceNormalPrefix` | `"👾"` | Prefix when usage is within `±pace.crit` of pace.     |
| `paceFastPrefix` | `"🔥"` | Prefix when usage is more than `pace.crit` ahead of pace. |

**Identity atoms.** The model, reasoning effort, and non-default service tier
render as separate atoms using the configured segment separator. Compact mode
maps known values (`xhigh` → `xh`, `high` → `h`, `medium` → `m`, `low` → `l`,
`minimal` → `min`, `fast` → `f`, `flex` → `fl`); full mode preserves their
canonical lowercase names. The `default` and `standard` service tiers are
omitted. The legacy `modelShort` and `effortShort` booleans are still accepted
as per-field compatibility overrides when present, but are no longer emitted.

`format.fastMode` forces the tier atom to `fast` regardless of the resolved
tier. In patched mode, Codex injects live identity through `CODEX_HUD_MODEL`,
`CODEX_HUD_EFFORT`, and `CODEX_HUD_SERVICE_TIER`, so `/model`, reasoning, and
`/fast` changes reflect immediately. In standalone or stock-launcher mode,
those variables are absent and the renderer reads Codex's `config.toml`
(`model`, `model_reasoning_effort`, and `service_tier`) instead.

## Defaults (`DEFAULT_CONFIG`, verbatim)

```js
{
  segments: ["model", "project", "branch", "ctx", "5h", "7d", "tkn"],
  space: false,
  separators: { segment: "|", tokenPart: ",", labelValue: ":", open: "(", close: ")" },
  labels: { ctx: "Ctx", "5h": "5h", "7d": "7d", tkn: "Tkn", tokenInput: "I:", tokenOutput: "O:", tokenCache: "C:" },
  colors: {
    model: "neonViolet", project: "cyan", branch: "neonViolet", runtime: "dim",
    dirty: "amber", label: "dim", separator: "dim",
    tokenTotal: "amber", tokenInput: "cyan", tokenOutput: "cyan", tokenCache: "cyan",
    pace: "mint", ok: "mint", warn: "amber", crit: "coral", none: "dim",
  },
  thresholds: { percent: { warn: 70, crit: 90 }, pace: { warn: 0, crit: 15 } },
  format: {
    percentRound: true, tokenUnits: true, tokenUsage: true, pace: true, pacePrefix: true,
    identityShort: true, fastMode: false,
    paceSlowPrefix: "🐢", paceNormalPrefix: "👾", paceFastPrefix: "🔥",
  },
}
```

## Color mapping (`#rrggbb` → xterm-256)

A `#rrggbb` value is reduced to the nearest xterm-256 index via `nearestXterm256`:

- Cube channel steps: `[0, 95, 135, 175, 215, 255]`. Each of r/g/b snaps to the
  nearest step; on a tie the **lower** step index wins (strict `<` comparison).
- Cube index: `16 + 36*ri + 6*gi + bi`.
- Grayscale ramp is considered when r≈g≈b: index `round((avg - 8) / 10)` clamped
  to `0..23` → `232 + n`; ties resolve toward the cube.

A port MUST reproduce these exact step boundaries, rounding, and tie-breaks.

## Parity-critical invariants (frozen)

These behaviors are easy to get subtly wrong in a reimplementation. The golden
fixtures lock them; do not "clean them up":

1. **Rounding is JS `Math.round`** (half toward +∞: `2.5`→`3`, `-1.5`→`-1`).
   A naive Rust `f64::round` (half away from zero) diverges on negatives.
2. **Token `k` abbreviation rounds, not truncates:** `Math.round(v/1000)` —
   `1500`→`2k`, `1499`→`1k`, `904321`→`904k`. The `M` path uses one decimal
   (`toFixed(1)`).
3. **Color gate:** with color disabled, output contains **zero** ANSI sequences
   and **no** reset code — raw text only.
4. **Empty-segment suppression:** a segment whose value is `null` **or** `""` is
   removed entirely, and **no separator** is emitted around the gap.
5. **Pace state markers use `usedPercent - pacePercent`:** below
   `-thresholds.pace.crit` is slow, above `thresholds.pace.crit` is fast, and
   the inclusive middle band is normal.
6. **`pace` default `mint` short-circuits** pace-delta coloring (the configured
   `pace` color wins over the computed delta color).
7. **Segment order is exactly `config.segments`**; alias expansion happens before
   rendering; arrays replace (never concat) on merge.
8. **Missing data renders `label:?`** (e.g. `5h:?`, `Tkn:?`), not an omitted
   segment.
9. **Identity atoms use the normal segment separator:** model, effort, and a
   non-default service tier are independently colorized pieces; `default` and
   `standard` tiers are omitted without leaving a separator gap.

## Enforcement

`scripts/test-golden.js` builds a deterministic fixture matrix (frozen clock,
synthetic `data`), feeds it to the exported `formatUsageLine` (compact line)
and `formatText` (multiline view), and diffs the result against
`scripts/golden/hud-output.golden`.

```bash
npm test                 # includes the golden parity check
npm run golden:update    # re-capture goldens after an intentional change
```
