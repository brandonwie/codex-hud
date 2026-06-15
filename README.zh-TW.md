**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**為 OpenAI Codex CLI 打造的工作區 HUD——獨立命令可以渲染多行工作區快照；實驗性修補版 Codex TUI 頁尾目前只渲染精簡的單行狀態列。**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#設定)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#快速開始)

[功能特色](#功能特色) · [快速開始](#快速開始) · [設定](#設定) · [修補版 Codex 頁尾](#實驗性功能修補版-codex-頁尾) · [發展藍圖](#發展藍圖)

</div>

---

Codex HUD 是一個本機 Codex 外掛，會為 OpenAI Codex CLI 工作階段呈現多行的工作區 HUD。

預設情況下，它是 Codex 原生 `[tui].status_line` 的搭配工具，因為原版 Codex 無法在輸入區下方繪製任意外掛輸出——它只公開一個可設定的內建狀態項目陣列，而非由外掛掌控的渲染器。本儲存庫同時提供一條持續維護的修補路徑，供希望讓精簡狀態列直接在真正的 Codex 頁尾中渲染的使用者使用。

以下是由 `--line` 印出的精簡狀態列（僅在修補模式下才會渲染為 TUI 內嵌頁尾）：

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> 該列中的區段、標籤、顏色與門檻全部都可設定——請參閱[設定](#設定)。

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

## 功能特色

- Codex 版本、模型、推理強度、沙箱以及核准模式
- 原生 Codex 狀態列項目數量與顏色設定
- 從 Codex rollout 紀錄解析而來的精簡用量——即上方的精簡狀態列（在修補模式下為 TUI 內嵌頁尾）
- 目前的工作目錄、git 分支、變動計數以及儲存庫根目錄
- 專案提示，例如套件名稱、鄰近的 `AGENTS.md`，以及存在時的 3B `ACTIVE-STATUS.md` 優先度
- 來自 `hooks.json` 的 Codex hook 事件計數
- 明確標示 Codex 原生狀態列在即時 token 與速率上限數值上仍具權威性

## 快速開始

複製此儲存庫，然後將其安裝為本機 Codex 外掛：

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# 將此儲存庫註冊為本機外掛市集，然後加入該外掛：
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

接著安裝 HUD 啟動器(建議)。預設模式**委派給你實際安裝的 Codex**,因此 Homebrew/npm 的 Codex 更新會自動套用 — 不需重新建置,也沒有修補二進位檔。要說明清楚的是:委派原生模式的啟動器**不會**渲染 TUI 內嵌頁尾 — 它提供安全的委派以及受管理的 `codex` 墊片;TUI 內嵌頁尾只存在於下方的實驗性修補模式。

```bash
npm run install:launcher                    # 安裝 ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # 可選:讓 `codex` 解析到該啟動器
rehash
```

你也可以選擇建置 Rust 狀態列渲染器。這不會改變以原生模式啟動的 TUI 中任何看得到的內容 — 它影響的是實驗性修補頁尾,以及獨立使用 `codex-hud` 的情境(`--watch`,或手動把 `status_line_command` 接到其他工具)。建置完成後,安裝程式會自動偵測並採用它(`--renderer auto`),供修補模式與 `--print-config` 使用:

```bash
npm run build:rust   # 可選:建置 rust/target/release/codex-hud
```

詳情見下文「HUD 啟動器」一節;診斷請執行 `npm run doctor`。

安裝或重新安裝後請開啟一個新的 Codex 執行緒，以便重新整理技能清單。

> **提示：** `codex plugin marketplace add "$(pwd)"` 會讀取目前的目錄，因此請從儲存庫根目錄執行。你也可以傳入明確的路徑來取代 `"$(pwd)"`。

## 使用方式

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # 獨立多行快照
./rust/target/release/codex-hud --line     # 單行精簡列
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # 機器可讀格式
./rust/target/release/codex-hud --watch 5   # 每 5 秒重新整理
npm test
```

精簡狀態列（`--line`）的終端機擷取：

```text
$ ./rust/target/release/codex-hud --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud`（執行 `npm run build:rust` 之後）提供完全相同的旗標介面——`--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`：

```bash
./rust/target/release/codex-hud --line --color
```

## 設定

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # 建立 ~/.codex/codex-hud.toml 樣板（--force 可覆寫）
codex-hud --print-config    # 以 JSON 印出解析並合併後的設定
codex-hud --config-path     # 顯示目前生效的設定檔
```

### 搜尋順序

較後的來源會覆寫較先的來源（以鍵為單位——陣列會替換，純量會覆寫）：

1. 內建預設值
2. `$CODEX_HOME/codex-hud.toml`（每位使用者；`$CODEX_HOME` 預設為 `~/.codex`）
3. `./.codex/codex-hud.toml`（每個專案；會向上尋找至 git 根目錄）
4. `$CODEX_HUD_CONFIG`（透過環境變數指定的明確檔案路徑）

找不到檔案沒有關係。格式錯誤或無效的檔案會被忽略——HUD 會退回預設值，並在 stderr 印出一行提示，因此狀態列永遠不會中斷。codex-hud 維護自己的檔案，而非放在 Codex `config.toml` 內的表格中，因此有問題的 HUD 設定永遠不會導致 Codex 無法啟動。

### 選項

```toml
# 預設為精簡模式。設為 true 可啟用 " | " 的區段間距與 ": " 標籤。
space = false

# 放在各區段之間的文字。space 旗標控制此文字周圍的留白。
separator = "|"

# 要顯示哪些區段以及顯示順序。Ids：
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# 別名：workspace = project + branch + runtime；context = ctx；tokens = tkn。
# （runtime /「node vX」可用，但預設關閉——將其加入即可啟用。）
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# 重新命名某個區段的標籤（鍵為區段 id）。
[labels]
ctx = "Ctx"

# 顏色：調色盤名稱、256 色色碼（0-255），或 "#rrggbb"（會對應到最接近的
# 256 色）。名稱：dim, coral, mint, amber, cyan, violet, neonViolet。
# ok / warn / crit 是 ctx / 5h / 7d 共用的門檻顏色。
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# 用來在 ok/warn/crit 之間切換 ctx/5h/7d 的百分比門檻（0-100）。
[thresholds.percent]
warn = 70
crit = 90

# 格式切換開關。
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> 僅顯示總計，隱藏 (I:.. O:.. C:..)
pace = true     # false -> hide the pace % in 5h/7d
modelShort = true # false -> gpt-5.5 而不是 5.5
effortShort = false # true -> xh 而不是 xhigh
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

節奏標記會將用量與均勻消耗速率比較：slow 表示比節奏落後超過 `thresholds.pace.crit`，fast 表示比節奏超前超過 `thresholds.pace.crit`，中間區間為 normal。執行 `codex-hud --print-config` 可查看完整解析後的選項集合。

## 平台支援

支援的 launcher 流程面向 macOS 與 Linux shell。WSL 在路徑透過 Linux 檔案系統解析時可能可用；不支援原生 Windows shell，因為受管理的 launcher 是 Bash 腳本。

## HUD 啟動器(委派原生 Codex — 預設模式)

`npm run install:launcher` 會寫入 `~/.local/bin/codex-hud-tui`:一個小型啟動器,它會找到你實際(原生)的 Codex 安裝並以 `exec -a codex` 執行,因此 Herdr 等終端整合仍會將該窗格辨識為 Codex 工作階段。原生二進位檔的路徑在安裝時寫入;若路徑失效,執行階段的後備機制會在 `PATH` 上重新尋找 Codex(會略過所有 HUD 管理的項目,因此啟動器永遠不會遞迴執行自身)。

由於啟動器委派給原生 Codex:

- Homebrew/npm 的 Codex 更新會自動套用 — 不需重新建置。
- 你的 Homebrew/原生 Codex 檔案永遠不會被修改或取代。
- `npm run install:launcher -- --make-default` 會安裝受管理的 `~/.local/bin/codex` 墊片;除非傳入 `--force-shim`,安裝程式會拒絕取代非受管理的 `codex`。

僅移除受管理的墊片:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` 會列印完整啟動鏈狀態 — 墊片、啟動器模式(stock/patched/legacy)、原生 Codex 路徑與版本、渲染器狀態、修補負載版本、是否過期以及遺留檔案:

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

僅在活動進入鏈損壞時才以非零代碼結束 — 渲染器降級永遠不會把健康狀態翻成異常。渲染器的重建建議以 release 為粒度:它會比較編譯時的 `codex-hud` 版本與 `package.json`,因此只有在發布版本變動時才會觸發,而不是每次提交都觸發。

## 疑難排解

先執行 `npm run doctor`。如果 shim 缺失、找不到原生 Codex、已 patch 的 runtime 過期、設定未套用，或缺少 Rust renderer，請先修復 Doctor 指出的鏈路節點，再重新執行對應的安裝或建置命令。

### 從舊版 codex-hud 安裝遷移

如果你先前執行過 `npm run patch:codex`(舊的預設流程),請執行一次 `npm run install:launcher`:它會把 `codex-hud-tui` 重寫為委派原生模式,並讓既有的 `codex` 墊片繼續運作。健康的舊 `codex-hud-codex` 命令會被保留(附帶過期提示);損壞的則被隔離為 `codex-hud-codex.broken-<timestamp>`,以便快速失敗而非啟動到一半當掉。下一次 `npm run patch:codex` 會把舊的扁平負載自動遷移到按版本分目錄的配置。執行 `npm run doctor` 可查看所有遺留項目。

## 實驗性功能:修補版 Codex 頁尾

> **警告 — 實驗性功能。** 此模式會建置本機修補、未簽署的 Codex 二進位檔。macOS 可能終止未簽署的重建產物(安裝程式會在啟用*之前*對每個負載做健康檢查,因此建置失敗永遠不會破壞你目前可用的 `codex`),且修補二進位檔**會在原生 Codex 更新後過期** — Codex 更新後必須重新執行 `npm run patch:codex`。除非你確實需要 TUI 內嵌頁尾,否則請使用預設的委派啟動器。

原生 Codex 無法在輸入區下方繪製任意外掛輸出。要獲得 Claude-HUD 風格的頁尾,需要建置獨立的修補版 Codex 命令:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

安全啟動器模式不會動到你一般的 `codex` 命令:

```bash
codex-hud-tui
```

要讓新的 `codex` 啟動使用啟用 HUD 的 TUI,請主動啟用受管理的墊片:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` 應解析到 `~/.local/bin/codex`。除非傳入 `--force-shim`,安裝程式拒絕取代既有的 `~/.local/bin/codex`;除非傳入 `--replace-codex`,它也拒絕把修補二進位檔本身安裝為 `codex`。

回滾只會移除受管理的 `codex` 墊片:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

如果你偏好持久設定,把列印出的行加到既有 `[tui]` 表之下;注意原生 Codex 版本可能拒絕未知欄位。在儲存庫根目錄產生適合你機器的精確設定行(`node scripts/install-patched-codex.js --print-config` 解析渲染器的方式與安裝程式相同):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

接著貼到 `~/.codex/config.toml` 的 `[tui]` 之下:

```toml
# 將 /Users/you 換成你的家目錄。
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

執行 `codex-hud-tui` 即可看到精簡頁尾。修補二進位檔不會跟隨原生 Codex 更新:建置後若原生 Codex 發生變更,修補啟動器會在啟動時列印一行警告(仍會執行你主動選擇的修補二進位檔)— 執行 `npm run patch:codex` 重新建置,或執行 `npm run install:launcher` 切回委派模式。每次重建都會經過暫存、健康檢查、原子啟用;前一個可用版本保留在 `~/.local/bin/codex-hud-codex.d/` 之下供回滾,`npm run doctor` 會回報過期與損壞的負載。當受管理的 `codex` 墊片啟用時,安裝程式在偵測基礎 Codex 版本時會略過該墊片,改用 `PATH` 上下一個真實的 `codex`;若需明確固定重建目標,請傳入 `--version <version>`。
## 專案結構

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # codex-hud 原始碼（預設狀態列渲染器）
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## 發展藍圖

- 若 Codex 為外掛公開穩定的本機 session-state API，則加入更豐富的工作階段逐字稿摘要。
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- 追蹤上游 OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827)。截至 2026-06-10，原版 Codex 仍只有內建的 `[tui].status_line` 項目，沒有命令驅動或外掛擁有的渲染器；只有在受支援的自訂渲染器發布後才退役這條修補路徑。

## 貢獻

歡迎提出 issue 與 pull request。變更 HUD 輸出後，請執行 `npm test` 與 Codex 外掛驗證器。變更 manifest 版本或發布 release 後，請以 `codex plugin add brandonwie@codex-hud` 重新整理本機外掛快取以進行手動測試，然後啟動新的 Codex thread 載入更新後的 skill metadata。

### 維護者腳本

常用維護命令：`npm test`、`npm run test:rust`、`npm run check:i18n`、`npm run doctor`、`npm run sync:version`。

## 授權

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
