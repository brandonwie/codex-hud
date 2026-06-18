**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**为 OpenAI Codex CLI 打造的工作区 HUD —— 独立命令可以渲染多行工作区快照；实验性补丁版 Codex TUI 页脚目前只渲染紧凑的单行状态行。**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Built with Rust](https://img.shields.io/badge/Built_with-Rust-dea584?style=for-the-badge&logo=rust&logoColor=white)](rust/Cargo.toml)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#配置)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#快速开始)

[功能](#功能) · [快速开始](#快速开始) · [配置](#配置) · [补丁版 Codex 页脚](#实验性功能补丁版-codex-页脚) · [路线图](#路线图)

</div>

---

Codex HUD 是一个本地 Codex 插件，为 OpenAI Codex CLI 会话渲染多行工作区 HUD。

默认情况下，它是 Codex 原生 `[tui].status_line` 的辅助伙伴，因为原生 Codex 无法在输入区下方渲染任意插件输出 —— 它公开了一个可配置的内置状态项数组，但没有提供由插件掌控的渲染器。本仓库还附带了一条持续维护的补丁路径，供希望让紧凑状态行直接渲染到真实 Codex 页脚的用户使用。

由 `--line` 打印的紧凑状态行（仅在补丁模式下才会渲染为 TUI 内嵌页脚）：

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> 该行中的各段、标签、颜色和阈值都是可配置的 —— 参见[配置](#配置)。

默认的状态行渲染器是 `codex-hud`，一个小巧的原生 Rust 二进制（edition 2021，MIT）：单个自包含的可执行文件，渲染路径上没有任何解释器，依赖极少（仅 `serde_json` 和 `toml`），零 `unsafe` 代码，并采用为体积优化的 release 构建，最终大小约 574 KB。为避免混淆，本 README 中出现了两个不同的「Rust」：上游 Codex CLI 本身就是一个 Rust 程序（即下文实验性补丁的构建目标），而 `codex-hud` 则是仓库内独立的状态行渲染器。

## 功能

- Codex 版本、模型、推理强度、沙箱以及审批模式
- 原生 Codex 状态行项目数量及颜色设置
- 从 Codex rollout 日志解析得到的紧凑用量 —— 即上方的紧凑行（补丁模式下为 TUI 内嵌页脚）
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
codex plugin add brandonwie@codex-hud
```

接下来安装 HUD 启动器(推荐)。默认模式**委派给你真实安装的 Codex**,因此 Homebrew/npm 的 Codex 更新会被自动拾取 — 无需重新构建,也没有补丁二进制。需要明确的是:委派原生模式的启动器**不会**渲染 TUI 内嵌页脚 — 它提供的是安全委派加受管的 `codex` 垫片;TUI 内嵌页脚只存在于下文的实验性补丁模式中。

```bash
npm run install:launcher                    # 安装 ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # 可选:让 `codex` 解析到该启动器
rehash
```

可选:构建 Rust 状态行渲染器。这不会给以原生方式启动的 TUI 带来任何可见变化 — 它只影响实验性补丁页脚,以及独立使用 `codex-hud` 的场景(`--watch`,或手动把 `status_line_command` 接进其他工具)。构建完成后,安装器会自动拾取它(`--renderer auto`),用于补丁模式和 `--print-config`:

```bash
npm run build:rust   # 可选:构建 rust/target/release/codex-hud
```

详情见下文「HUD 启动器」一节;诊断请运行 `npm run doctor`。

安装或重新安装后请启动一个新的 Codex 线程，以便刷新技能列表。

> **提示：** `codex plugin marketplace add "$(pwd)"` 会读取当前目录，因此请在仓库根目录下运行它。你也可以传入一个明确的路径来代替 `"$(pwd)"`。

## 用法

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # 独立多行快照
./rust/target/release/codex-hud --line     # 单行紧凑展示
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # 机器可读
./rust/target/release/codex-hud --watch 5   # 每 5 秒刷新一次
npm test
```

紧凑状态行（`--line`）的终端捕获：

```text
$ ./rust/target/release/codex-hud --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud`（在 `npm run build:rust` 之后）提供完全相同的参数界面 —— `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`：

```bash
./rust/target/release/codex-hud --line --color
```

## 配置

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

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
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> 仅总计，隐藏 (I:.. O:.. C:..)
pace = true     # false -> hide the pace % in 5h/7d
pacePrefix = true   # false -> 隐藏节奏图标 (🐢/👾/🔥)，保留 %
modelShort = true # false -> gpt-5.5 而不是 5.5
effortShort = false # true -> xh 而不是 xhigh
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

节奏标记会将用量与均匀消耗速率比较：slow 表示比节奏落后超过 `thresholds.pace.crit`，fast 表示比节奏超前超过 `thresholds.pace.crit`，中间区间为 normal。运行 `codex-hud --print-config` 以查看完整解析后的选项集。

## 平台支持

受支持的 launcher 流程面向 macOS 和 Linux shell。WSL 在路径通过 Linux 文件系统解析时可能可用；不支持原生 Windows shell，因为托管 launcher 是 Bash 脚本。

## HUD 启动器(委派原生 Codex — 默认模式)

`npm run install:launcher` 会写入 `~/.local/bin/codex-hud-tui`:一个小型启动器,它找到你真实(原生)的 Codex 安装并用 `exec -a codex` 执行,因此 Herdr 等终端集成仍会把该窗格识别为 Codex 会话。原生二进制的路径在安装时写入,若路径失效则有运行时回退逻辑在 `PATH` 上重新发现 Codex(会跳过所有 HUD 管理的条目,因此启动器永远不会递归执行自身)。

由于启动器委派给原生 Codex:

- Homebrew/npm 的 Codex 更新会被自动拾取 — 无需重新构建。
- 你的 Homebrew/原生 Codex 文件永远不会被修改或替换。
- `npm run install:launcher -- --make-default` 安装受管的 `~/.local/bin/codex` 垫片;除非传入 `--force-shim`,安装器拒绝替换非受管的 `codex`。

仅移除受管垫片:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` 打印完整启动链状态 — 垫片、启动器模式(stock/patched/legacy)、原生 Codex 路径与版本、渲染器状态、补丁负载版本、是否过期以及遗留产物:

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

仅当活动入口链损坏时才以非零码退出 — 渲染器退化绝不会把 healthy 状态翻转为失败。渲染器的重建建议按发布粒度工作:它把编译进 `codex-hud` 的版本与 `package.json` 进行比较,因此只在发布推进版本号时才会触发,而不是每次提交都触发。

## 故障排除

先运行 `npm run doctor`。如果 shim 缺失、找不到原生 Codex、已 patch 的 runtime 过期、配置未生效，或缺少 Rust renderer，请先修复 Doctor 指出的链路节点，然后重新运行对应的安装或构建命令。

### 从旧版 codex-hud 安装迁移

如果你以前运行过 `npm run patch:codex`(旧的默认流程),请运行一次 `npm run install:launcher`:它会把 `codex-hud-tui` 重写为委派原生模式,并保持现有的 `codex` 垫片继续工作。健康的旧 `codex-hud-codex` 命令会被保留(附带过期提示);损坏的则被隔离为 `codex-hud-codex.broken-<timestamp>`,从而快速失败而不是启动到一半崩溃。下一次 `npm run patch:codex` 会把旧的扁平负载自动迁移到按版本分目录的布局。运行 `npm run doctor` 可查看所有遗留项。

## 实验性功能:补丁版 Codex 页脚

> **警告 — 实验性功能。** 此模式会构建本地打补丁的未签名 Codex 二进制。macOS 可能杀掉未签名的重新构建产物(安装器会在激活*之前*对每个负载做健康检查,因此构建失败永远不会破坏你当前可用的 `codex`),并且补丁二进制**会在原生 Codex 更新后过期** — Codex 更新后你必须重新运行 `npm run patch:codex`。除非你确实需要 TUI 内嵌页脚,否则请使用默认的委派启动器。

原生 Codex 无法在输入区下方渲染任意插件输出。要获得 Claude-HUD 风格的页脚,需要构建一个独立的补丁版 Codex 命令:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

安全启动器模式不会动你常规的 `codex` 命令:

```bash
codex-hud-tui
```

要让新的 `codex` 启动使用启用 HUD 的 TUI,请主动启用受管垫片:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` 应解析到 `~/.local/bin/codex`。除非传入 `--force-shim`,安装器拒绝替换已存在的 `~/.local/bin/codex`;除非传入 `--replace-codex`,它也拒绝把补丁二进制本身安装为 `codex`。

回滚只会移除受管的 `codex` 垫片:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

如果你偏好持久配置,把打印出的行添加到现有 `[tui]` 表下;注意原生 Codex 版本可能拒绝未知字段。在仓库根目录生成适合你机器的精确配置行(`node scripts/install-patched-codex.js --print-config` 解析渲染器的方式与安装器完全一致):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

然后粘贴到 `~/.codex/config.toml` 的 `[tui]` 下:

```toml
# 将 /Users/you 替换为你的家目录。
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

运行 `codex-hud-tui` 即可看到紧凑页脚。补丁二进制不会跟随原生 Codex 更新:构建后若原生 Codex 发生变化,补丁启动器会在启动时打印一行警告(仍会运行你主动选择的补丁二进制)— 运行 `npm run patch:codex` 重新构建,或运行 `npm run install:launcher` 切回委派模式。每次重新构建都会经过暂存、健康检查、原子激活;上一个可用版本保留在 `~/.local/bin/codex-hud-codex.d/` 下用于回滚,`npm run doctor` 会报告过期与损坏的负载。当受管 `codex` 垫片处于激活状态时,安装器在检测基础 Codex 版本时会跳过该垫片,使用 `PATH` 上下一个真实的 `codex`;如需显式固定重建目标,请传入 `--version <version>`。
## 项目结构

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # codex-hud 源码 (默认状态行渲染器)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## 路线图

- 如果 Codex 为插件公开稳定的本地会话状态 API，则添加更丰富的会话记录摘要。
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- 跟踪上游 OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827)。截至 2026-06-10，原版 Codex 仍只有内置的 `[tui].status_line` 项目，没有命令驱动或插件拥有的渲染器；只有在受支持的自定义渲染器发布后才退役该补丁。

## 贡献

欢迎提交 issue 和 pull request。更改 HUD 输出后，请运行 `npm test` 以及 Codex 插件验证器。更改清单版本或发布 release 后，请用 `codex plugin add brandonwie@codex-hud` 刷新本地插件缓存以进行手动测试，然后启动新的 Codex 线程以加载更新后的技能元数据。

### 维护者脚本

常用维护命令：`npm test`、`npm run test:rust`、`npm run check:i18n`、`npm run doctor`、`npm run sync:version`、`npm run measure:rust`（报告 release 二进制的大小（约 574 KB），并将 Rust 渲染器的延迟与旧版 Node 渲染器进行对比）。

## 许可证

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
