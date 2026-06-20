**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**OpenAI Codex CLI 向けのワークスペース HUD — スタンドアロンコマンドでは複数行のワークスペース概要を表示できますが、実験的なパッチ済み Codex TUI フッターは現在コンパクトな 1 行ステータスラインのみを表示します。**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Built with Rust](https://img.shields.io/badge/Built_with-Rust-dea584?style=for-the-badge&logo=rust&logoColor=white)](rust/Cargo.toml)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#設定)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#クイックスタート)

[機能](#機能) · [クイックスタート](#クイックスタート) · [設定](#設定) · [パッチ済み Codex フッター](#実験的機能-パッチ済み-codex-フッター) · [ロードマップ](#ロードマップ)

</div>

---

Codex HUD は、OpenAI Codex CLI のセッション向けに複数行のワークスペース HUD を描画するローカルの Codex プラグインです。

デフォルトでは Codex ネイティブの `[tui].status_line` を補完する役割を担います。標準の Codex は入力エリアの下に任意のプラグイン出力を描画できず、設定可能な組み込みステータス項目の配列は公開していても、プラグインが所有するレンダラーは公開していないためです。このリポジトリには、コンパクトなステータスラインを実際の Codex フッターに直接描画したいユーザー向けに、メンテナンスされたパッチパスも同梱されています。

`--line` が出力するコンパクトなステータスライン（TUI 内フッターとして描画されるのはパッチモードのみ）:

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> この行のセグメント、ラベル、色、しきい値はすべて設定可能です — [設定](#設定) を参照してください。

デフォルトのステータスラインレンダラーは `codex-hud` で、小さなネイティブ Rust バイナリ(edition 2021、MIT)です。インタープリターを描画パスに介在させない単一の自己完結型実行ファイルで、依存関係は最小限(`serde_json` と `toml` のみ)、`unsafe` コードはゼロ、サイズ最適化したリリースビルドはおよそ 574 KB に収まります。なお、この README には 2 つの異なる「Rust」が登場します。上流の Codex CLI それ自体が Rust 製プログラム(後述の実験的パッチのビルド対象)であり、一方の `codex-hud` はこのリポジトリ内にある別個のステータスラインレンダラーです。

## 機能

- Codex のバージョン、モデル、推論の労力（reasoning effort）、サンドボックス、承認モード
- ネイティブ Codex のステータスライン項目数と色設定
- Codex のロールアウトログから解析したコンパクトな使用状況 — 上記のコンパクトな行（パッチモードでは TUI 内フッター）
- 現在の作業ディレクトリ、git ブランチ、ダーティ件数、リポジトリルート
- パッケージ名、近くの `AGENTS.md`、存在する場合は 3B の `ACTIVE-STATUS.md` の優先度といったプロジェクトのヒント
- `hooks.json` からの Codex フックイベント件数
- ライブのトークン値とレート制限値については Codex ネイティブのステータスラインが引き続き信頼できる情報源である旨の明確な注記

## クイックスタート

### ワンライナーインストール

最速の方法です。ソースからビルドするため、`PATH` 上に `git`、`node`、Rust ツールチェーン（`cargo`）と、動作する `codex` が必要です:

```bash
curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | bash
```

これは固定リリースをクローンし、`codex-hud` レンダラーをビルドし、ストック委譲ランチャーをインストールし、プラグインを登録します — 既存の `codex` コマンドには**手を付けません**。`codex` を HUD ランチャーに解決させたい場合は、スクリプトを実行するシェルにフラグを渡してください: `curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | CODEX_HUD_MAKE_DEFAULT=1 bash`。実行前に内容を確認するには、`curl -fsSLO https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh` でダウンロードして読んでから `bash install.sh` を実行してください。

Rust ツールチェーンがない、または手動で制御したい場合は、後述のステップバイステップのセットアップを使ってください。

リポジトリをクローンし、ローカルの Codex プラグインとしてインストールします。

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# このリポジトリをローカルのプラグインマーケットプレイスとして登録し、プラグインを追加します:
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

次に HUD ランチャーをインストールします(推奨)。デフォルトモードは**実際の Codex インストールに委譲**するため、Homebrew/npm の Codex 更新が自動的に反映されます — 再ビルドもパッチ済みバイナリも不要です。明確にしておくと、ストック委譲ランチャーは TUI 内フッターを描画**しません** — 提供するのは安全な委譲と管理対象の `codex` シムであり、TUI 内フッターは後述の実験的なパッチモードにのみ存在します:

```bash
npm run install:launcher                    # ~/.local/bin/codex-hud-tui をインストール
npm run install:launcher -- --make-default  # 任意: `codex` をランチャーに解決させる
rehash
```

任意で、Rust 製のステータスラインレンダラーをビルドできます。ストック起動の TUI では見た目には何も変わりません — 意味を持つのは、実験的なパッチ済みフッターと、`codex-hud` の単体利用(`--watch` の利用や、他のツールへ `status_line_command` を手動で組み込む場合)です。一度ビルドすれば、インストーラーがパッチモードと `--print-config` 向けに自動的に検出します(`--renderer auto`):

```bash
npm run build:rust   # 任意: rust/target/release/codex-hud をビルド
```

詳細は後述の「HUD ランチャー」セクションを、診断は `npm run doctor` を参照してください。

スキルリストが更新されるよう、インストールまたは再インストール後は新しい Codex スレッドを開始してください。

> **ヒント:** `codex plugin marketplace add "$(pwd)"` は現在のディレクトリを読み取るため、リポジトリのルートから実行してください。`"$(pwd)"` の代わりに明示的なパスを渡すこともできます。

## 使い方

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # standalone expanded snapshot
./rust/target/release/codex-hud --line     # single compact line
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # machine-readable
./rust/target/release/codex-hud --watch 5   # refresh every 5s
npm test
```

コンパクトなステータスライン(`--line`)のターミナルキャプチャ:

```text
$ ./rust/target/release/codex-hud --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud`(`npm run build:rust` の実行後)は、まったく同じフラグ群を公開します — `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`:

```bash
./rust/target/release/codex-hud --line --color
```

## 設定

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # scaffold ~/.codex/codex-hud.toml (--force to overwrite)
codex-hud --print-config    # print the resolved, merged config as JSON
codex-hud --config-path     # show which config files are in effect
```

### 検索順序

後のソースが先のソースを上書きします（キー単位で — 配列は置換、スカラーは上書き）:

1. 組み込みのデフォルト
2. `$CODEX_HOME/codex-hud.toml`（ユーザーごと。`$CODEX_HOME` のデフォルトは `~/.codex`）
3. `./.codex/codex-hud.toml`（プロジェクトごと。git ルートまで遡ります）
4. `$CODEX_HUD_CONFIG`（環境変数による明示的なファイルパス）

ファイルがなくても問題ありません。形式が不正または無効なファイルは無視され、HUD はデフォルトにフォールバックして stderr に 1 行の注記を表示するため、ステータスラインが壊れることはありません。codex-hud は Codex の `config.toml` 内のテーブルではなく独自のファイルを保持するため、不正な HUD 設定が Codex の起動を妨げることは決してありません。

### オプション

```toml
# Compact by default. Set true for " | " segment spacing and ": " labels.
space = false

# Text placed between segments. The space flag controls padding around this text.
separator = "|"

# Which segments to show, in order. Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Aliases: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" is available but off by default — add it to opt in.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Rename a segment's label (keys are segment ids).
[labels]
ctx = "Ctx"

# Colors: a palette name, a 256-color code (0-255), or "#rrggbb" (mapped to the
# nearest 256 color). Names: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit are the threshold colors shared by ctx / 5h / 7d.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Percent thresholds (0-100) that switch ctx/5h/7d between ok/warn/crit.
[thresholds.percent]
warn = 70
crit = 90

# Formatting toggles.
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> total only, hide (I:.. O:.. C:..)
pace = true     # false -> hide the pace % in 5h/7d
pacePrefix = true   # false -> ペースアイコン(🐢/👾/🔥)を隠し、% は残す
modelShort = true # false -> 5.5 ではなく gpt-5.5
effortShort = false # true -> xhigh ではなく xh
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

ペースマーカーは使用量を均等な消費ペースと比較します。slow は `thresholds.pace.crit` を超えてペースより遅れている状態、fast は `thresholds.pace.crit` を超えてペースより進んでいる状態で、その中間帯は normal です。`codex-hud --print-config` を実行すると、解決された全オプションセットを確認できます。

## プラットフォームサポート

サポート対象のランチャーフローは macOS と Linux のシェル向けです。WSL は Linux ファイルシステム経由でパスが解決される場合に動作することがありますが、管理対象ランチャーは Bash スクリプトなのでネイティブ Windows シェルはサポートしません。

## HUD ランチャー(ストック委譲 — デフォルト)

`npm run install:launcher` は `~/.local/bin/codex-hud-tui` を書き込みます。この小さなランチャーは実際の(ストック)Codex インストールを見つけて `exec -a codex` で実行するため、Herdr などのターミナル統合は引き続きそのペインを Codex セッションとして認識します。ストックバイナリのパスはインストール時に埋め込まれ、見つからない場合は `PATH` 上で Codex を再探索するランタイムフォールバックが働きます(HUD 管理のエントリはすべてスキップするため、ランチャーが自分自身を再帰的に実行することはありません)。

ランチャーはストック Codex に委譲するため:

- Homebrew/npm の Codex 更新は自動的に反映されます — 再ビルド不要。
- Homebrew/ストック Codex のファイルは決して変更・置換されません。
- `npm run install:launcher -- --make-default` は管理対象の `~/.local/bin/codex` シムをインストールします。管理外の `codex` は `--force-shim` を渡さない限り置換を拒否します。

管理対象シムのみを削除するには:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` は起動チェーン全体の状態を表示します — シム、ランチャーモード(stock/patched/legacy)、ストック Codex のパスとバージョン、レンダラーの状態、パッチ済みペイロードのバージョン、鮮度、残存アーティファクト:

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

アクティブなエントリポイントチェーンが壊れている場合にのみ非ゼロで終了します — レンダラーの劣化が healthy ステータスを覆すことはありません。レンダラーの再ビルド推奨はリリース粒度です。コンパイル時に埋め込まれた `codex-hud` のバージョンを `package.json` と比較するため、リリースでバージョンが上がったときに発火し、コミットごとには発火しません。

## トラブルシューティング

まず `npm run doctor` を実行してください。shim がない、ストック Codex が見つからない、パッチ済みランタイムが古い、設定が反映されない、Rust レンダラーがない場合は、Doctor が示すチェーンの該当箇所を修復してから対応するインストールまたはビルドコマンドを再実行してください。

### 旧 codex-hud インストールからの移行

以前に `npm run patch:codex`(旧デフォルトフロー)を実行していた場合は、`npm run install:launcher` を一度実行してください。`codex-hud-tui` をストック委譲に書き換え、既存の `codex` シムはそのまま機能し続けます。正常な旧 `codex-hud-codex` コマンドは(古くなる旨の注記とともに)そのまま残され、壊れたものは `codex-hud-codex.broken-<timestamp>` として隔離され、起動中に死ぬ代わりに即座に失敗します。次回の `npm run patch:codex` で旧フラットペイロードはバージョン別レイアウトへ自動移行されます。残存物は `npm run doctor` で確認できます。

## 実験的機能: パッチ済み Codex フッター

> **警告 — 実験的機能です。** このモードはローカルでパッチした未署名の Codex バイナリをビルドします。macOS が未署名の再ビルドを強制終了することがあり(インストーラーは有効化の*前に*すべてのペイロードをヘルスチェックするため、ビルド失敗がアクティブな `codex` を壊すことはありません)、パッチ済みバイナリは**ストック Codex の更新で古くなります** — Codex 更新後は `npm run patch:codex` の再実行が必要です。TUI 内フッターがどうしても必要な場合を除き、デフォルトのストック委譲ランチャーを使ってください。

ストック Codex は入力エリアの下に任意のプラグイン出力を描画できません。Claude HUD スタイルのフッターを得るには、別個のパッチ済み Codex コマンドをビルドします:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

セーフランチャーモードは通常の `codex` コマンドに手を付けません:

```bash
codex-hud-tui
```

新しい `codex` 起動で HUD 対応 TUI を使うには、管理対象シムにオプトインします:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` は `~/.local/bin/codex` に解決されるはずです。インストーラーは `--force-shim` を渡さない限り既存の `~/.local/bin/codex` の置換を拒否し、`--replace-codex` を渡さない限りパッチ済みバイナリ自体を `codex` としてインストールすることも拒否します。

ロールバックは管理対象の `codex` シムのみを削除します:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

永続的な設定を好む場合は、出力された行を既存の `[tui]` テーブルの下に追加してください。ただしストックの Codex バージョンは未知のフィールドを拒否することがあります。リポジトリルートで、お使いのマシン向けの正確な行を生成します(`node scripts/install-patched-codex.js --print-config` はインストーラーと同じ方法でレンダラーを解決します):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

その後 `~/.codex/config.toml` の `[tui]` の下に貼り付けます:

```toml
# /Users/you をホームディレクトリに置き換えてください。
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

`codex-hud-tui` を実行するとコンパクトフッターが表示されます。パッチ済みバイナリはストック Codex の更新を追跡しません。ビルド後にストック Codex が変わると、パッチランチャーは起動時に 1 行の警告を出力します(オプトインしたパッチ済みバイナリはそのまま実行されます)— `npm run patch:codex` で再ビルドするか、`npm run install:launcher` でストック委譲に戻ってください。再ビルドは毎回ステージング → ヘルスチェック → 原子的有効化の順で行われ、直前の正常バージョンはロールバック用に `~/.local/bin/codex-hud-codex.d/` 配下に残り、`npm run doctor` が鮮度や壊れたペイロードを報告します。管理対象の `codex` シムが有効な場合、インストーラーはベースの Codex バージョン検出時にそのシムをスキップし、`PATH` 上の次の実際の `codex` を使います。再ビルド対象を明示的に固定するには `--version <version>` を渡してください。
## プロジェクト構成

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # codex-hud source (default status-line renderer)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## ロードマップ

- Codex がプラグイン向けに安定したローカルのセッション状態 API を公開した場合、より充実したセッショントランスクリプトの要約を追加する。
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- 上流の OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827) を監視する。2026-06-10 時点では、標準の Codex には組み込みの `[tui].status_line` 項目はあるが、コマンド駆動またはプラグイン所有のレンダラーはない。サポートされたカスタムレンダラーがリリースされた場合にのみ、このパッチを廃止する。
- SHA-256 チェックサム付きのビルド済み `codex-hud` リリースバイナリを配布し、ワンライナーインストーラーがローカルの Rust ビルドを省略できるようにする。

## 貢献

Issue とプルリクエストを歓迎します。貢献のワークフローとメンテナースクリプトの完全なリファレンスは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
