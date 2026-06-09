**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**為 OpenAI Codex CLI 打造的精簡彩色工作區 HUD——將模型、專案、git、上下文以及 5h/7d 用量整合在單一頁尾列中。**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#設定)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#快速開始)

[功能特色](#功能特色) · [快速開始](#快速開始) · [設定](#設定) · [修補版 Codex 頁尾](#修補版-codex-頁尾) · [發展藍圖](#發展藍圖)

</div>

---

Codex HUD 是一個本機 Codex 外掛，會為 OpenAI Codex CLI 工作階段呈現多行的工作區 HUD。

預設情況下，它是 Codex 原生 `[tui].status_line` 的搭配工具，因為原版 Codex 只公開一個可設定的內建狀態項目陣列，而非由外掛掌控的渲染器。本儲存庫同時提供一條持續維護的修補路徑，供希望讓 HUD 腳本直接在真正的 Codex 頁尾中渲染的使用者使用。

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> 該列中的區段、標籤、顏色與門檻全部都可設定——請參閱[設定](#設定)。

## 功能特色

- Codex 版本、模型、推理強度、沙箱以及核准模式
- 原生 Codex 狀態列項目數量與顏色設定
- 從 Codex rollout 紀錄解析而來的精簡用量（即上方的範例頁尾）
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
codex plugin add codex-hud@codex-hud
```

安裝或重新安裝後請開啟一個新的 Codex 執行緒，以便重新整理技能清單。

> **提示：** `codex plugin marketplace add "$(pwd)"` 會讀取目前的目錄，因此請從儲存庫根目錄執行。你也可以傳入明確的路徑來取代 `"$(pwd)"`。

## 使用方式

在開發過程中直接執行渲染器：

```bash
node plugins/codex-hud/scripts/codex-hud.js           # 多行 HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # 單行精簡列
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # 機器可讀格式
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # 每 5 秒重新整理
npm test
```

## 設定

頁尾可透過選用的 `codex-hud.toml` 進行設定。若沒有設定檔，你會得到上方所示的預設頁尾；每個鍵都是選用的，任何省略的項目都會沿用內建預設值。

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
tokenParts = true   # false -> 僅顯示總計，隱藏 (I:.. O:.. C:..)
showPace = true     # false -> 隱藏 5h/7d 中的步調 %
```

執行 `codex-hud --print-config` 可查看完整解析後的選項集合。

## 修補版 Codex 頁尾

原版 Codex 無法在輸入區域下方渲染任意的外掛輸出。若要取得 Claude-HUD 風格的頁尾，請建置一個獨立的修補版 Codex 指令：

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

安裝程式會修補相符的 OpenAI Codex 標籤、建置 Rust CLI，並將真正的可執行檔保留在 `~/.local/bin/codex-hud-codex.d/codex`，並以 `~/.local/bin/codex-hud-codex` 作為指向該二進位檔的符號連結。它也會寫入 `~/.local/bin/codex-hud-tui`，這是一個啟動器，會透過 Codex 的 `-c tui.status_line_command=...` 覆寫傳入彩色 HUD 指令，而不變更 `~/.codex/config.toml`。可執行檔路徑與 `argv[0]` 都會保留 Codex 可見的名稱，因此像 Herdr 這類終端整合仍能將該窗格辨識為 Codex 工作階段。

安全啟動器模式不會動到你平常的 `codex` 指令：

```bash
codex-hud-tui
```

若要讓全新的 `codex` 啟動使用啟用 HUD 的 TUI，請選擇加入受管 shim：

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` 應解析到 `~/.local/bin/codex`。除非你傳入 `--force-shim`，否則安裝程式拒絕取代現有的 `~/.local/bin/codex`；而且除非你傳入 `--replace-codex`，否則它仍拒絕將修補版二進位檔本身安裝為 `codex`。

回復只會移除受管的 `codex` shim：

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

若你偏好持久化的設定，可將印出的那一行加到你現有的 `[tui]` 表格下，但請注意原版 Codex 版本可能會拒絕未知欄位。從儲存庫根目錄為你的機器產生確切的那一行：

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

然後將其貼到 `~/.codex/config.toml` 的 `[tui]` 下方：

```toml
# 將 /path/to/codex-hud 換成你的本機複製路徑。
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

執行 `codex-hud-tui` 即可看到精簡頁尾。Homebrew 或 Codex 更新不會更新這個獨立的指令；更新 Codex 後請重新執行 `npm run patch:codex`。當受管的 `codex` shim 處於啟用狀態時，安裝程式在偵測基礎 Codex 版本時會略過該 shim，並改用 `PATH` 上下一個真正的 `codex`；若你需要明確固定重建目標，請傳入 `--version <version>`。重建後的酬載必須先通過 `--version` 健康檢查，啟動器才會被重寫。

## 專案結構

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD 渲染器 + 設定載入器
│     ├─ vendor/toml.js              # 內附的 TOML 解析器（smol-toml）
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # 重新產生 vendor/toml.js
   └─ install-patched-codex.js
```

## 發展藍圖

- 若 Codex 為外掛公開穩定的本機 session-state API，則加入更豐富的工作階段逐字稿摘要。
- 追蹤上游 Codex 狀態列的變更，以便在受支援的自訂渲染器登場時可以退役這條修補路徑。
- 待 Codex 外掛目錄卡片準備好發布後，加入螢幕截圖。

## 貢獻

歡迎提出 issue 與 pull request。變更 HUD 輸出後，請執行 `npm test` 與 Codex 外掛驗證器；變更 manifest 版本後，請以 `codex plugin add codex-hud@codex-hud` 重新安裝本機外掛。

## 授權

[MIT](LICENSE) © Brandon Wie
