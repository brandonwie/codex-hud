**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | Deutsch | [Español](README.es.md)

<div align="center">

# Codex HUD

**Ein Workspace-HUD für die OpenAI Codex CLI — eigenständige Befehle können eine mehrzeilige Workspace-Übersicht ausgeben; der experimentell gepatchte Codex-TUI-Footer zeigt derzeit nur die kompakte einzeilige Status-Line.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Built with Rust](https://img.shields.io/badge/Built_with-Rust-dea584?style=for-the-badge&logo=rust&logoColor=white)](rust/Cargo.toml)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#konfiguration)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#schnellstart)

[Funktionen](#funktionen) · [Schnellstart](#schnellstart) · [Konfiguration](#konfiguration) · [Gepatchter Codex-Footer](#experimentell-gepatchter-codex-footer) · [Roadmap](#roadmap)

</div>

---

Codex HUD ist ein lokales Codex-Plugin, das ein mehrzeiliges Workspace-HUD für Sitzungen der OpenAI Codex CLI darstellt.

Standardmäßig ist es ein Begleiter zur nativen `[tui].status_line` von Codex, denn Stock-Codex kann unterhalb des Eingabebereichs keine beliebige Plugin-Ausgabe rendern — es stellt zwar ein konfigurierbares, integriertes Array aus Status-Elementen bereit, aber keinen Plugin-eigenen Renderer. Dieses Repo liefert außerdem einen gepflegten Patch-Pfad für Nutzer mit, die das HUD direkt in der echten Codex-Fußzeile darstellen möchten.

Die kompakte Status-Line, ausgegeben mit `--line` (nur im Patched-Modus als Fußzeile in der TUI gerendert):

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Die Segmente, Labels, Farben und Schwellenwerte in dieser Zeile sind alle konfigurierbar — siehe [Konfiguration](#konfiguration).

Der Standard-Status-Line-Renderer ist `codex-hud`, ein kleines natives Rust-Binary (edition 2021, MIT): eine einzelne, eigenständige ausführbare Datei ohne Interpreter im Rendering-Pfad, mit minimalem Abhängigkeits-Fußabdruck (nur `serde_json` und `toml`), null `unsafe`-Code und einem größenoptimierten Release-Build, der bei etwa 574 KB landet. Zur Klarstellung: In diesem README tauchen zwei verschiedene „Rust" auf — die Upstream-Codex-CLI ist selbst ein Rust-Programm (das Build-Ziel des experimentellen Patches weiter unten), während `codex-hud` der separate, im Repo enthaltene Status-Line-Renderer ist.

## Funktionen

- Codex-Version, Modell, Reasoning-Aufwand, Sandbox und Genehmigungsmodus
- Anzahl und Farbeinstellung der nativen Codex-Status-Line-Elemente
- Kompakte Nutzung, geparst aus den Codex-Rollout-Logs — die kompakte Zeile oben (im Patched-Modus eine Fußzeile in der TUI)
- Aktuelles Arbeitsverzeichnis, Git-Branch, Dirty-Counts und Repo-Root
- Projekt-Hinweise wie Paketname, nahegelegene `AGENTS.md` und 3B-`ACTIVE-STATUS.md`-Priorität, sofern vorhanden
- Codex-Hook-Event-Zählungen aus `hooks.json`
- Ein klarer Hinweis, dass die native Status-Line von Codex für Live-Token- und Rate-Limit-Werte maßgeblich bleibt

## Schnellstart

### Installation mit einem Befehl

Der schnellste Weg. Es baut aus dem Quellcode, benötigt also `git`, `node` und eine Rust-Toolchain (`cargo`) auf deinem `PATH` sowie ein funktionierendes `codex`:

```bash
curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | bash
```

Das klont ein gepinntes Release, baut den `codex-hud`-Renderer, installiert den Stock-Delegations-Launcher und registriert das Plugin — dein bestehendes `codex`-Kommando wird dabei **nicht** angetastet. Damit `codex` zusätzlich auf den HUD-Launcher auflöst, übergib das Flag an die Shell, die das Skript ausführt: `curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | CODEX_HUD_MAKE_DEFAULT=1 bash`. Um eine Vorschau zu sehen, ohne etwas zu ändern, führe `bash install.sh --dry-run` aus (oder setze `CODEX_HUD_DRY_RUN=1`). Zum Prüfen vor dem Ausführen lade es mit `curl -fsSLO https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh` herunter, lies es und führe dann `bash install.sh` aus.

Keine Rust-Toolchain oder lieber manuelle Kontrolle? Nutze die schrittweise Einrichtung weiter unten.

Klone das Repo und installiere es dann als lokales Codex-Plugin:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Dieses Repo als lokalen Plugin-Marketplace registrieren, dann das Plugin hinzufügen:
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

Installiere anschließend den HUD-Launcher (empfohlen). Der Standardmodus **delegiert an deine echte Codex-Installation**, sodass Homebrew-/npm-Updates von Codex automatisch übernommen werden — keine Rebuilds, keine gepatchten Binaries. Zur Klarstellung: Der Stock-Delegations-Launcher rendert **keine** Fußzeile in der TUI — er bietet sichere Delegation plus das verwaltete `codex`-Shim; eine Fußzeile in der TUI gibt es nur im experimentellen Patched-Modus weiter unten.

```bash
npm run install:launcher                    # installiert ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # optional: `codex` auf den Launcher auflösen
rehash
```

Optional kannst du den Rust-Status-Line-Renderer bauen. In einer mit Stock-Codex gestarteten TUI ändert das nichts Sichtbares — wichtig ist es für die experimentelle gepatchte Fußzeile und für die eigenständige Nutzung von `codex-hud` (`--watch` oder das manuelle Einbinden von `status_line_command` in andere Tools). Einmal gebaut, übernimmt der Installer es automatisch (`--renderer auto`) für den Patched-Modus und `--print-config`:

```bash
npm run build:rust   # baut rust/target/release/codex-hud
```

Details im Abschnitt „HUD-Launcher" weiter unten; Diagnose mit `npm run doctor`.

Starte nach dem Installieren oder Neuinstallieren einen neuen Codex-Thread, damit die Skill-Liste aktualisiert wird.

> **Tipp:** `codex plugin marketplace add "$(pwd)"` liest das aktuelle Verzeichnis, führe es also aus dem Repo-Root aus. Du kannst statt `"$(pwd)"` auch einen expliziten Pfad übergeben.

## Verwendung

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # eigenständige mehrzeilige Übersicht
./rust/target/release/codex-hud --line     # einzelne kompakte Zeile
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # maschinenlesbar
./rust/target/release/codex-hud --watch 5   # alle 5s aktualisieren
npm test
```

Terminal-Mitschnitt der kompakten Status-Line (`--line`):

```text
$ ./rust/target/release/codex-hud --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud` (nach `npm run build:rust`) unterstützt exakt dieselben Flags — `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`:

```bash
./rust/target/release/codex-hud --line --color
```

## Konfiguration

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # ~/.codex/codex-hud.toml anlegen (--force zum Überschreiben)
codex-hud --print-config    # die aufgelöste, zusammengeführte Konfiguration als JSON ausgeben
codex-hud --config-path     # anzeigen, welche Konfigurationsdateien wirksam sind
```

### Suchreihenfolge

Spätere Quellen überschreiben frühere (pro Schlüssel — Arrays ersetzen, Skalare überschreiben):

1. eingebaute Standardwerte
2. `$CODEX_HOME/codex-hud.toml` (pro Benutzer; `$CODEX_HOME` ist standardmäßig `~/.codex`)
3. `./.codex/codex-hud.toml` (pro Projekt; läuft hoch bis zum Git-Root)
4. `$CODEX_HUD_CONFIG` (expliziter Dateipfad über Umgebungsvariable)

Eine fehlende Datei ist in Ordnung. Eine fehlerhafte oder ungültige Datei wird ignoriert — das HUD fällt auf die Standardwerte zurück und gibt einen einzeiligen Hinweis auf stderr aus, sodass die Status-Line niemals bricht. codex-hud führt seine eigene Datei statt einer Tabelle innerhalb der `config.toml` von Codex, sodass eine fehlerhafte HUD-Konfiguration niemals den Start von Codex verhindern kann.

### Optionen

```toml
# Standardmäßig kompakt. Auf true setzen für " | " als Segmentabstand und ": " als Labels.
space = false

# Text, der zwischen den Segmenten platziert wird. Das space-Flag steuert das Padding um diesen Text.
separator = "|"

# Welche Segmente in welcher Reihenfolge angezeigt werden. Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Aliase: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" ist verfügbar, aber standardmäßig aus — zum Aktivieren hinzufügen.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Das Label eines Segments umbenennen (Schlüssel sind Segment-Ids).
[labels]
ctx = "Ctx"

# Farben: ein Palettenname, ein 256-Farben-Code (0-255) oder "#rrggbb" (auf die
# nächstgelegene 256-Farbe abgebildet). Namen: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit sind die Schwellenwert-Farben, die von ctx / 5h / 7d gemeinsam genutzt werden.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Prozent-Schwellenwerte (0-100), die ctx/5h/7d zwischen ok/warn/crit umschalten.
[thresholds.percent]
warn = 70
crit = 90

# Formatierungs-Schalter.
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> nur Gesamtwert, (I:.. O:.. C:..) ausblenden
pace = true     # false -> hide the pace % in 5h/7d
pacePrefix = true   # false -> Pace-Icon (🐢/👾/🔥) ausblenden, % behalten
modelShort = true # false -> gpt-5.5 statt 5.5
effortShort = false # true -> xh statt xhigh
fastMode = false
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

Pace-Markierungen vergleichen die Nutzung mit der gleichmäßigen Verbrauchsrate: slow liegt mehr als `thresholds.pace.crit` hinter dem Plan, fast liegt mehr als `thresholds.pace.crit` davor, und der mittlere Bereich ist normal. Führe `codex-hud --print-config` aus, um den vollständigen aufgelösten Optionssatz zu sehen.

## Plattformunterstützung

Der unterstützte Launcher-Ablauf richtet sich an macOS- und Linux-Shells. WSL kann funktionieren, wenn Pfade über das Linux-Dateisystem aufgelöst werden; native Windows-Shells werden nicht unterstützt, da die verwalteten Launcher Bash-Skripte sind.

## HUD-Launcher (Stock-Delegation — Standard)

`npm run install:launcher` schreibt `~/.local/bin/codex-hud-tui`, einen kleinen Launcher, der deine echte (Stock-)Codex-Installation findet und sie mit `exec -a codex` ausführt — Terminal-Integrationen wie Herdr erkennen das Pane also weiterhin als Codex-Session. Der Pfad des Stock-Binaries wird bei der Installation eingebettet; fehlt er, greift ein Laufzeit-Fallback, der Codex erneut auf dem `PATH` sucht (alle HUD-verwalteten Einträge werden übersprungen, der Launcher kann sich daher nie rekursiv selbst ausführen).

Weil der Launcher an Stock-Codex delegiert:

- Homebrew-/npm-Updates von Codex werden automatisch übernommen — keine Rebuilds.
- Deine Homebrew-/Stock-Codex-Dateien werden niemals verändert oder ersetzt.
- `npm run install:launcher -- --make-default` installiert das verwaltete Shim `~/.local/bin/codex`; ein nicht verwaltetes `codex` ersetzt der Installer nur mit `--force-shim`.

Nur das verwaltete Shim entfernen:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` zeigt den vollständigen Zustand der Startkette — Shim, Launcher-Modus (stock/patched/legacy), Pfad + Version von Stock-Codex, Renderer-Zustand, Versionen der gepatchten Payloads, Veraltung und übrig gebliebene Artefakte:

```text
prefix: /Users/you/.local/bin
codex shim: managed -> /Users/you/.local/bin/codex-hud-tui (/Users/you/.local/bin/codex)
launcher: v2 mode=stock (/Users/you/.local/bin/codex-hud-tui)
launcher metadata: stock_path=/opt/homebrew/bin/codex stock_realpath=/opt/homebrew/Cellar/codex/0.139.0/bin/codex stock_version=0.139.0 renderer=rust built_at=2026-06-10T12:00:00.000Z
stock codex: /opt/homebrew/bin/codex (0.139.0, realpath /opt/homebrew/Cellar/codex/0.139.0/bin/codex)
renderer: rust (/Users/you/.local/bin/codex-hud, v0.2.0; used by --print-config/patched mode only — stock launcher does not invoke it)
patched payload dir: /Users/you/.local/bin/codex-hud-codex.d
patched versions: (none)
patched command: (none)
status: healthy
```

Der Befehl endet nur dann mit einem Exit-Code ungleich null, wenn die aktive Startkette defekt ist — ein degradierter Renderer kippt einen gesunden Status nie. Die Rebuild-Empfehlung für den Renderer arbeitet auf Release-Granularität: Sie vergleicht die einkompilierte `codex-hud`-Version mit `package.json` und schlägt daher an, wenn ein Release die Version anhebt — nicht bei jedem Commit.

## Fehlerbehebung

Beginnen Sie mit `npm run doctor`. Wenn der Shim fehlt, der Stock-Codex nicht gefunden wird, die gepatchte Laufzeit veraltet ist, Konfiguration nicht übernommen wird oder der Rust-Renderer fehlt, reparieren Sie zuerst das von Doctor gemeldete Glied der Kette und führen Sie anschließend den passenden Installations- oder Build-Befehl erneut aus.

### Migration von einer älteren codex-hud-Installation

Wenn du früher `npm run patch:codex` (den alten Standard-Flow) verwendet hast, führe einmal `npm run install:launcher` aus: Es schreibt `codex-hud-tui` auf Stock-Delegation um und dein bestehendes `codex`-Shim funktioniert weiter. Ein funktionierendes Legacy-Kommando `codex-hud-codex` bleibt erhalten (mit Veraltungshinweis); ein defektes wird als `codex-hud-codex.broken-<timestamp>` in Quarantäne verschoben und schlägt sofort fehl, statt mitten im Start zu sterben. Das nächste `npm run patch:codex` migriert eine alte flache Payload automatisch in das versionierte Layout. `npm run doctor` zeigt alles Übriggebliebene.

## Experimentell: Gepatchter Codex-Footer

> **Warnung — experimentell.** Dieser Modus baut ein lokal gepatchtes, unsigniertes Codex-Binary. macOS kann unsignierte Rebuilds beenden (der Installer prüft jede Payload *vor* der Aktivierung per Health-Check, ein fehlgeschlagener Build kann dein aktives `codex` also nie beschädigen), und das gepatchte Binary **veraltet, sobald Stock-Codex aktualisiert wird** — nach Codex-Updates musst du `npm run patch:codex` erneut ausführen. Bevorzuge den standardmäßigen Stock-Delegations-Launcher, sofern du den Footer in der TUI nicht ausdrücklich brauchst.

Stock-Codex kann unterhalb des Eingabebereichs keine beliebige Plugin-Ausgabe rendern. Für einen Footer im Claude-HUD-Stil baust du ein separates gepatchtes Codex-Kommando:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

Der sichere Launcher-Modus lässt dein normales `codex`-Kommando in Ruhe:

```bash
codex-hud-tui
```

Damit ein frischer `codex`-Start die HUD-fähige TUI nutzt, aktiviere das verwaltete Shim ausdrücklich:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` sollte auf `~/.local/bin/codex` auflösen. Der Installer ersetzt ein vorhandenes `~/.local/bin/codex` nur mit `--force-shim` und installiert das gepatchte Binary selbst nur mit `--replace-codex` als `codex`.

Das Rollback entfernt nur das verwaltete `codex`-Shim:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Wenn du eine dauerhafte Konfiguration bevorzugst, füge die ausgegebene Zeile unter deine bestehende `[tui]`-Tabelle ein — beachte aber, dass Stock-Codex-Versionen unbekannte Felder ablehnen können. Erzeuge die exakte Zeile für deinen Rechner im Repo-Root (`node scripts/install-patched-codex.js --print-config` löst den Renderer genauso auf wie der Installer):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

Füge sie dann unter `[tui]` in `~/.codex/config.toml` ein:

```toml
# Ersetze /Users/you durch dein Home-Verzeichnis.
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

Führe `codex-hud-tui` aus, um den kompakten Footer zu sehen. Das gepatchte Binary folgt Stock-Codex-Updates nicht: Ändert sich Stock-Codex nach einem Build, gibt der gepatchte Launcher beim Start eine einzeilige Warnung aus (und führt weiterhin das von dir gewählte gepatchte Binary aus) — baue mit `npm run patch:codex` neu oder wechsle mit `npm run install:launcher` zurück zur Stock-Delegation. Jeder Rebuild wird gestaged, health-gecheckt und atomar aktiviert; die vorherige funktionierende Version bleibt für Rollbacks unter `~/.local/bin/codex-hud-codex.d/`, und `npm run doctor` meldet Veraltung und defekte Payloads. Ist das verwaltete `codex`-Shim aktiv, überspringt der Installer es bei der Erkennung der Basis-Codex-Version und nutzt das nächste echte `codex` auf dem `PATH`; mit `--version <version>` kannst du das Rebuild-Ziel explizit festlegen.
## Projektstruktur

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # codex-hud-Quellcode (Standard-Status-Line-Renderer)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## Roadmap

- Reichhaltigere Zusammenfassungen von Sitzungs-Transkripten hinzufügen, falls Codex eine stabile lokale Session-State-API für Plugins bereitstellt.
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- Das Upstream-OpenAI-Codex-Issue [#17827](https://github.com/openai/codex/issues/17827) beobachten. Stand 2026-06-10 hat Stock Codex weiterhin eingebaute `[tui].status_line`-Elemente, aber keinen command-basierten oder plugin-eigenen Renderer; mustere den Patch erst aus, wenn ein unterstützter benutzerdefinierter Renderer veröffentlicht ist.
- Vorgebaute `codex-hud`-Release-Binaries mit SHA-256-Prüfsummen ausliefern, damit der Ein-Befehl-Installer den lokalen Rust-Build überspringen kann.

## Mitwirken

Issues und Pull Requests sind willkommen. Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für den Beitragsworkflow und die vollständige Referenz der Maintainer-Skripte.

## Lizenz

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
