**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**为 OpenAI Codex CLI 打造的紧凑、彩色工作区 HUD —— 在单行页脚中呈现模型、项目、git、上下文以及 5h/7d 用量。**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#配置)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#快速开始)

[功能](#功能) · [快速开始](#快速开始) · [配置](#配置) · [打补丁的 Codex 页脚](#打补丁的-codex-页脚) · [路线图](#路线图)

</div>

---

Codex HUD 是一个本地 Codex 插件，为 OpenAI Codex CLI 会话渲染多行工作区 HUD。

默认情况下，它是 Codex 原生 `[tui].status_line` 的辅助伙伴，因为原生 Codex 公开了一个可配置的内置状态项数组，但没有提供由插件掌控的渲染器。本仓库还附带了一条持续维护的补丁路径，供希望让 HUD 脚本直接渲染到真实 Codex 页脚的用户使用。

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> 该行中的各段、标签、颜色和阈值都是可配置的 —— 参见[配置](#配置)。

## 功能

- Codex 版本、模型、推理强度、沙箱以及审批模式
- 原生 Codex 状态行项目数量及颜色设置
- 从 Codex rollout 日志解析得到的紧凑用量（即上方的示例页脚）
- 当前工作目录、git 分支、未提交计数以及仓库根目录
- 项目提示，例如包名、附近的 `AGENTS.md`，以及（存在时）3B `ACTIVE-STATUS.md` 优先级
- 来自 `hooks.json` 的 Codex 钩子事件计数
- 一条明确说明：对于实时 token 和速率限制数值，Codex 原生状态行仍是权威来源

## 快速开始

克隆仓库，然后将其作为本地 Codex 插件安装：

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# 将本仓库注册为本地插件市场，然后添加插件：
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

安装或重新安装后请启动一个新的 Codex 线程，以便刷新技能列表。

> **提示：** `codex plugin marketplace add "$(pwd)"` 会读取当前目录，因此请在仓库根目录下运行它。你也可以传入一个明确的路径来代替 `"$(pwd)"`。

## 用法

在开发期间直接运行渲染器：

```bash
node plugins/codex-hud/scripts/codex-hud.js           # 多行 HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # 单行紧凑展示
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # 机器可读
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # 每 5 秒刷新一次
npm test
```

## 配置

页脚可通过一个可选的 `codex-hud.toml` 进行配置。若没有配置文件，你将得到上方展示的默认页脚；每个键都是可选的，凡是省略的项都会继承内置默认值。

```bash
codex-hud --init-config     # 生成 ~/.codex/codex-hud.toml（用 --force 覆盖）
codex-hud --print-config    # 以 JSON 形式打印解析并合并后的配置
codex-hud --config-path     # 显示当前生效的是哪些配置文件
```

### 搜索顺序

靠后的来源会覆盖靠前的来源（按键生效 —— 数组替换，标量覆盖）：

1. 内置默认值
2. `$CODEX_HOME/codex-hud.toml`（按用户；`$CODEX_HOME` 默认为 `~/.codex`）
3. `./.codex/codex-hud.toml`（按项目；向上查找直至 git 根目录）
4. `$CODEX_HUD_CONFIG`（通过环境变量指定的明确文件路径）

缺失文件没有关系。格式错误或无效的文件会被忽略 —— HUD 会回退到默认值并在 stderr 上打印一行提示，因此状态行永远不会损坏。codex-hud 保留自己的文件，而不是在 Codex 的 `config.toml` 内嵌一张表，所以一个糟糕的 HUD 配置绝不会导致 Codex 无法启动。

### 选项

```toml
# 默认紧凑。设为 true 可启用 " | " 段间距和 ": " 标签。
space = false

# 放置在各段之间的文本。space 标志控制该文本周围的填充。
separator = "|"

# 要显示哪些段，以及它们的顺序。Ids：
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# 别名：workspace = project + branch + runtime；context = ctx；tokens = tkn。
# （runtime / "node vX" 可用，但默认关闭 —— 将其加入以启用。）
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# 重命名某个段的标签（键为段 id）。
[labels]
ctx = "Ctx"

# 颜色：调色板名称、256 色代码（0-255），或 "#rrggbb"（映射到
# 最接近的 256 色）。名称：dim, coral, mint, amber, cyan, violet, neonViolet。
# ok / warn / crit 是由 ctx / 5h / 7d 共享的阈值颜色。
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# 百分比阈值（0-100），用于在 ok/warn/crit 之间切换 ctx/5h/7d。
[thresholds.percent]
warn = 70
crit = 90

# 格式化开关。
[format]
tokenParts = true   # false -> 仅总计，隐藏 (I:.. O:.. C:..)
showPace = true     # false -> 隐藏 5h/7d 中的 pace %
```

运行 `codex-hud --print-config` 以查看完整解析后的选项集。

## 打补丁的 Codex 页脚

原生 Codex 无法在输入区下方渲染任意插件输出。若想获得 Claude-HUD 风格的页脚，请构建一个独立的、打过补丁的 Codex 命令：

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

安装器会为匹配的 OpenAI Codex tag 打补丁、构建 Rust CLI，并将真实可执行文件保留在 `~/.local/bin/codex-hud-codex.d/codex` 下，同时把 `~/.local/bin/codex-hud-codex` 作为指向该二进制的符号链接。它还会写入 `~/.local/bin/codex-hud-tui`，这是一个启动器，通过 Codex 的 `-c tui.status_line_command=...` 覆盖项传入彩色 HUD 命令，而无需更改 `~/.codex/config.toml`。可执行文件路径与 `argv[0]` 都保持 Codex 可见的名称，因此 Herdr 等终端集成仍能将该面板识别为 Codex 会话。

安全启动器模式不会影响你正常的 `codex` 命令：

```bash
codex-hud-tui
```

若要让全新的 `codex` 启动使用启用了 HUD 的 TUI，请选择启用受管理的 shim：

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` 应解析为 `~/.local/bin/codex`。除非你传入 `--force-shim`，否则安装器拒绝替换已存在的 `~/.local/bin/codex`；并且除非你传入 `--replace-codex`，否则它仍拒绝把打过补丁的二进制本身安装为 `codex`。

回滚仅移除受管理的 `codex` shim：

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

如果你更倾向于持久化配置，可将打印出来的那一行添加到你现有的 `[tui]` 表下，但请注意原生 Codex 版本可能会拒绝未知字段。从仓库根目录为你的机器生成确切的那一行：

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

然后将其粘贴到 `~/.codex/config.toml` 的 `[tui]` 下：

```toml
# 将 /path/to/codex-hud 替换为你的本地克隆路径。
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

运行 `codex-hud-tui` 即可看到紧凑页脚。Homebrew 或 Codex 更新不会更新这个独立命令；更新 Codex 后请重新运行 `npm run patch:codex`。当受管理的 `codex` shim 处于激活状态时，安装器会在检测基础 Codex 版本时跳过该 shim，并使用 `PATH` 上下一个真实的 `codex`；若你需要显式固定重建目标，请传入 `--version <version>`。重建后的载荷必须先通过一次 `--version` 健康检查，然后才会重写启动器。

## 项目结构

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD 渲染器 + 配置加载器
│     ├─ vendor/toml.js              # 内置的 TOML 解析器 (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # 重新生成 vendor/toml.js
   └─ install-patched-codex.js
```

## 路线图

- 如果 Codex 为插件公开稳定的本地会话状态 API，则添加更丰富的会话记录摘要。
- 跟踪上游 Codex 状态行的变更，以便在受支持的自定义渲染器落地后可以撤销该补丁。
- 待 Codex 插件目录卡片准备好发布后，添加截图。

## 贡献

欢迎提交 issue 和 pull request。更改 HUD 输出后，请运行 `npm test` 以及 Codex 插件验证器；更改清单版本后，请用 `codex plugin add codex-hud@codex-hud` 重新安装本地插件。

## 许可证

[MIT](LICENSE) © Brandon Wie
