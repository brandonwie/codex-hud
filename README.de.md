**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | Deutsch | [Español](README.es.md)

<div align="center">

# Codex HUD

**Ein kompaktes, farbiges Workspace-HUD für die OpenAI Codex CLI — Modell, Projekt, Git, Kontext und 5h/7d-Nutzung in einer einzigen Fußzeile.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#konfiguration)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#schnellstart)

[Funktionen](#funktionen) · [Schnellstart](#schnellstart) · [Konfiguration](#konfiguration) · [Gepatchte Codex-Fußzeile](#gepatchte-codex-fußzeile) · [Roadmap](#roadmap)

</div>

---

Codex HUD ist ein lokales Codex-Plugin, das ein mehrzeiliges Workspace-HUD für Sitzungen der OpenAI Codex CLI darstellt.

Standardmäßig ist es ein Begleiter zur nativen `[tui].status_line` von Codex, denn das Standard-Codex stellt zwar ein konfigurierbares, integriertes Array aus Status-Elementen bereit, aber keinen Plugin-eigenen Renderer. Dieses Repo liefert außerdem einen gepflegten Patch-Pfad für Nutzer mit, die das HUD-Skript direkt in der echten Codex-Fußzeile darstellen möchten.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Die Segmente, Labels, Farben und Schwellenwerte in dieser Zeile sind alle konfigurierbar — siehe [Konfiguration](#konfiguration).

## Funktionen

- Codex-Version, Modell, Reasoning-Aufwand, Sandbox und Genehmigungsmodus
- Anzahl und Farbeinstellung der nativen Codex-Status-Line-Elemente
- Kompakte Nutzung, geparst aus den Codex-Rollout-Logs (die Beispiel-Fußzeile oben)
- Aktuelles Arbeitsverzeichnis, Git-Branch, Dirty-Counts und Repo-Root
- Projekt-Hinweise wie Paketname, nahegelegene `AGENTS.md` und 3B-`ACTIVE-STATUS.md`-Priorität, sofern vorhanden
- Codex-Hook-Event-Zählungen aus `hooks.json`
- Ein klarer Hinweis, dass die native Status-Line von Codex für Live-Token- und Rate-Limit-Werte maßgeblich bleibt

## Schnellstart

Klone das Repo und installiere es dann als lokales Codex-Plugin:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Dieses Repo als lokalen Plugin-Marketplace registrieren, dann das Plugin hinzufügen:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

Installiere anschließend den HUD-Launcher (empfohlen). Der Standardmodus **delegiert an deine echte Codex-Installation**, sodass Homebrew-/npm-Updates von Codex automatisch übernommen werden — keine Rebuilds, keine gepatchten Binaries:

```bash
npm run install:launcher                    # installiert ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # optional: `codex` auf den Launcher auflösen
rehash
```

Details im Abschnitt „HUD-Launcher" weiter unten; Diagnose mit `npm run doctor`.

Starte nach dem Installieren oder Neuinstallieren einen neuen Codex-Thread, damit die Skill-Liste aktualisiert wird.

> **Tipp:** `codex plugin marketplace add "$(pwd)"` liest das aktuelle Verzeichnis, führe es also aus dem Repo-Root aus. Du kannst statt `"$(pwd)"` auch einen expliziten Pfad übergeben.

## Verwendung

Führe den Renderer während der Entwicklung direkt aus:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # mehrzeiliges HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # einzelne kompakte Zeile
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # maschinenlesbar
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # alle 5s aktualisieren
npm test
```

Terminal-Mitschnitt der standardmäßigen kompakten Fußzeile:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

Führe lokal `node plugins/codex-hud/scripts/codex-hud.js --line --color` aus, um dieselbe Fußzeile mit ANSI-Farbstilen zu sehen.

## Konfiguration

Die Fußzeile ist über eine optionale `codex-hud.toml` konfigurierbar. Ohne Konfigurationsdatei erhältst du die oben gezeigte Standard-Fußzeile; jeder Schlüssel ist optional, und alles, was du weglässt, erbt den eingebauten Standardwert.

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
tokenParts = true   # false -> nur Gesamtwert, (I:.. O:.. C:..) ausblenden
showPace = true     # false -> die Pace-% in 5h/7d ausblenden
```

Führe `codex-hud --print-config` aus, um den vollständigen aufgelösten Optionssatz zu sehen.

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

`npm run doctor` zeigt den vollständigen Zustand der Startkette — Shim, Launcher-Modus (stock/patched/legacy), Pfad + Version von Stock-Codex, Versionen der gepatchten Payloads, Veraltung und übrig gebliebene Artefakte:

```text
prefix: /Users/you/.local/bin
codex shim: managed -> /Users/you/.local/bin/codex-hud-tui (/Users/you/.local/bin/codex)
launcher: v2 mode=stock (/Users/you/.local/bin/codex-hud-tui)
stock codex: /opt/homebrew/bin/codex (0.139.0, realpath /opt/homebrew/Cellar/codex/0.139.0/bin/codex)
patched payload dir: /Users/you/.local/bin/codex-hud-codex.d
patched versions: (none)
patched command: (none)
status: healthy
```

Der Befehl endet nur dann mit einem Exit-Code ungleich null, wenn die aktive Startkette defekt ist.

### Migration von einer älteren codex-hud-Installation

Wenn du früher `npm run patch:codex` (den alten Standard-Flow) verwendet hast, führe einmal `npm run install:launcher` aus: Es schreibt `codex-hud-tui` auf Stock-Delegation um und dein bestehendes `codex`-Shim funktioniert weiter. Ein funktionierendes Legacy-Kommando `codex-hud-codex` bleibt erhalten (mit Veraltungshinweis); ein defektes wird als `codex-hud-codex.broken-<timestamp>` in Quarantäne verschoben und schlägt sofort fehl, statt mitten im Start zu sterben. Das nächste `npm run patch:codex` migriert eine alte flache Payload automatisch in das versionierte Layout. `npm run doctor` zeigt alles Übriggebliebene.

## Experimentell: Gepatchter Codex-Footer

> **Warnung — experimentell.** Dieser Modus baut ein lokal gepatchtes, unsigniertes Codex-Binary. macOS kann unsignierte Rebuilds beenden (der Installer prüft jede Payload *vor* der Aktivierung per Health-Check, ein fehlgeschlagener Build kann dein aktives `codex` also nie beschädigen), und das gepatchte Binary **veraltet, sobald Stock-Codex aktualisiert wird** — nach Codex-Updates musst du `npm run patch:codex` erneut ausführen. Bevorzuge den standardmäßigen Stock-Delegations-Launcher, sofern du den Footer in der TUI nicht ausdrücklich brauchst.

Stock-Codex kann unterhalb des Eingabebereichs keine beliebige Plugin-Ausgabe rendern. Für einen Footer im Claude-HUD-Stil baust du ein separates gepatchtes Codex-Kommando:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

Der Installer patcht den passenden OpenAI-Codex-Tag, baut die Rust-CLI und staged das Executable unter `~/.local/bin/codex-hud-codex.d/<version>/codex`. Die gestagte Payload muss **vor** jeder Aktivierung einen `--version`-Health-Check bestehen; erst dann wird `~/.local/bin/codex-hud-codex` atomar auf die neue Payload umgehängt, und die vorherige Version bleibt für Rollbacks auf der Platte. Ein fehlgeschlagener Build wird als `<version>.failed` beiseitegelegt, die aktive Laufzeit bleibt unangetastet. Außerdem wird `~/.local/bin/codex-hud-tui` im Patched-Modus geschrieben — ein Launcher, der das farbige HUD-Kommando über Codex' Override `-c tui.status_line_command=...` übergibt, ohne `~/.codex/config.toml` zu ändern. Executable-Pfad und `argv[0]` behalten Codex-sichtbare Namen, sodass Terminal-Integrationen wie Herdr das Pane weiterhin als Codex-Session erkennen.

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

Wenn du eine dauerhafte Konfiguration bevorzugst, füge die ausgegebene Zeile unter deine bestehende `[tui]`-Tabelle ein — beachte aber, dass Stock-Codex-Versionen unbekannte Felder ablehnen können. Erzeuge die exakte Zeile für deinen Rechner im Repo-Root:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Füge sie dann unter `[tui]` in `~/.codex/config.toml` ein:

```toml
# Ersetze /path/to/codex-hud durch deinen lokalen Klon-Pfad.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Führe `codex-hud-tui` aus, um den kompakten Footer zu sehen. Das gepatchte Binary folgt Stock-Codex-Updates nicht: Ändert sich Stock-Codex nach einem Build, gibt der gepatchte Launcher beim Start eine einzeilige Warnung aus (und führt weiterhin das von dir gewählte gepatchte Binary aus) — baue mit `npm run patch:codex` neu oder wechsle mit `npm run install:launcher` zurück zur Stock-Delegation. Jeder Rebuild wird gestaged, health-gecheckt und atomar aktiviert; die vorherige funktionierende Version bleibt für Rollbacks unter `~/.local/bin/codex-hud-codex.d/`, und `npm run doctor` meldet Veraltung und defekte Payloads. Ist das verwaltete `codex`-Shim aktiv, überspringt der Installer es bei der Erkennung der Basis-Codex-Version und nutzt das nächste echte `codex` auf dem `PATH`; mit `--version <version>` kannst du das Rebuild-Ziel explizit festlegen.
## Projektstruktur

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD-Renderer + Konfigurations-Loader
│     ├─ vendor/toml.js              # mitgelieferter TOML-Parser (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # generiert vendor/toml.js neu
   └─ install-patched-codex.js
```

## Roadmap

- Reichhaltigere Zusammenfassungen von Sitzungs-Transkripten hinzufügen, falls Codex eine stabile lokale Session-State-API für Plugins bereitstellt.
- Das Upstream-OpenAI-Codex-Issue [#17827](https://github.com/openai/codex/issues/17827) beobachten. Stand 2026-06-10 hat Stock Codex weiterhin eingebaute `[tui].status_line`-Elemente, aber keinen command-basierten oder plugin-eigenen Renderer; mustere den Patch erst aus, wenn ein unterstützter benutzerdefinierter Renderer veröffentlicht ist.

## Mitwirken

Issues und Pull Requests sind willkommen. Führe nach dem Ändern der HUD-Ausgabe `npm test` und den Codex-Plugin-Validator aus. Aktualisiere nach einer Manifest-Versionsänderung oder einem Release den lokalen Plugin-Cache für manuelle Tests mit `codex plugin add codex-hud@codex-hud` und starte danach einen neuen Codex-Thread, damit die aktualisierten Skill-Metadaten geladen werden.

## Lizenz

[MIT](LICENSE) © Brandon Wie
