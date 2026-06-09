**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**OpenAI Codex CLI 向けの、コンパクトで色付きのワークスペース HUD — モデル、プロジェクト、git、コンテキスト、5h/7d の使用状況を 1 行のフッターにまとめます。**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#設定)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#クイックスタート)

[機能](#機能) · [クイックスタート](#クイックスタート) · [設定](#設定) · [パッチ適用版 Codex フッター](#パッチ適用版-codex-フッター) · [ロードマップ](#ロードマップ)

</div>

---

Codex HUD は、OpenAI Codex CLI のセッション向けに複数行のワークスペース HUD を描画するローカルの Codex プラグインです。

デフォルトでは Codex ネイティブの `[tui].status_line` を補完する役割を担います。標準の Codex は設定可能な組み込みステータス項目の配列を公開していますが、プラグインが所有するレンダラーは公開していないためです。このリポジトリには、HUD スクリプトを実際の Codex フッターに直接描画したいユーザー向けに、メンテナンスされたパッチパスも同梱されています。

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> この行のセグメント、ラベル、色、しきい値はすべて設定可能です — [設定](#設定) を参照してください。

## 機能

- Codex のバージョン、モデル、推論の労力（reasoning effort）、サンドボックス、承認モード
- ネイティブ Codex のステータスライン項目数と色設定
- Codex のロールアウトログから解析したコンパクトな使用状況（上記のフッター例）
- 現在の作業ディレクトリ、git ブランチ、ダーティ件数、リポジトリルート
- パッケージ名、近くの `AGENTS.md`、存在する場合は 3B の `ACTIVE-STATUS.md` の優先度といったプロジェクトのヒント
- `hooks.json` からの Codex フックイベント件数
- ライブのトークン値とレート制限値については Codex ネイティブのステータスラインが引き続き信頼できる情報源である旨の明確な注記

## クイックスタート

リポジトリをクローンし、ローカルの Codex プラグインとしてインストールします。

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# このリポジトリをローカルのプラグインマーケットプレイスとして登録し、プラグインを追加します:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

スキルリストが更新されるよう、インストールまたは再インストール後は新しい Codex スレッドを開始してください。

> **ヒント:** `codex plugin marketplace add "$(pwd)"` は現在のディレクトリを読み取るため、リポジトリのルートから実行してください。`"$(pwd)"` の代わりに明示的なパスを渡すこともできます。

## 使い方

開発中はレンダラーを直接実行します。

```bash
node plugins/codex-hud/scripts/codex-hud.js           # multiline HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # single compact line
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # machine-readable
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # refresh every 5s
npm test
```

## 設定

フッターは任意の `codex-hud.toml` を通じて設定できます。設定ファイルがない場合は上記のデフォルトフッターが表示されます。すべてのキーは任意で、省略したものは組み込みのデフォルトを継承します。

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
tokenParts = true   # false -> total only, hide (I:.. O:.. C:..)
showPace = true     # false -> hide the pace % in 5h/7d
```

`codex-hud --print-config` を実行すると、解決された全オプションセットを確認できます。

## パッチ適用版 Codex フッター

標準の Codex は、入力エリアの下に任意のプラグイン出力を描画できません。Claude HUD スタイルのフッターを得るには、別途パッチ適用版の Codex コマンドをビルドします。

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

インストーラーは一致する OpenAI Codex タグにパッチを適用し、Rust CLI をビルドして、実際の実行ファイルを `~/.local/bin/codex-hud-codex.d/codex` に保持し、`~/.local/bin/codex-hud-codex` をそのバイナリへのシンボリックリンクにします。また `~/.local/bin/codex-hud-tui` も書き込みます。これは、`~/.codex/config.toml` を変更せずに色付き HUD コマンドを Codex の `-c tui.status_line_command=...` オーバーライド経由で渡すランチャーです。実行ファイルのパスと `argv[0]` はどちらも Codex から認識できる名前を保つため、Herdr のようなターミナル統合は引き続きそのペインを Codex セッションとして認識できます。

セーフランチャーモードは、通常の `codex` コマンドには手を加えません。

```bash
codex-hud-tui
```

新しい `codex` の起動で HUD 対応の TUI を使うようにするには、管理対象のシムをオプトインします。

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` は `~/.local/bin/codex` に解決されるはずです。インストーラーは、`--force-shim` を渡さない限り既存の `~/.local/bin/codex` の置き換えを拒否し、さらに `--replace-codex` を渡さない限りパッチ適用版バイナリ自体を `codex` としてインストールすることも拒否します。

ロールバックは、管理対象の `codex` シムのみを削除します。

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

永続的な設定を好む場合は、表示された行を既存の `[tui]` テーブルの下に追加します。ただし、標準の Codex バージョンは未知のフィールドを拒否する場合があることに注意してください。リポジトリのルートから、自分のマシン向けの正確な行を生成します。

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

そして `~/.codex/config.toml` の `[tui]` の下に貼り付けます。

```toml
# Replace /path/to/codex-hud with your local clone path.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

`codex-hud-tui` を実行するとコンパクトなフッターが表示されます。Homebrew や Codex のアップデートでこの別コマンドが更新されることはありません。Codex を更新した後は `npm run patch:codex` を再実行してください。管理対象の `codex` シムが有効な場合、インストーラーはベースの Codex バージョンを検出する際にそのシムをスキップし、`PATH` 上の次の実際の `codex` を使用します。リビルド対象を明示的に固定する必要がある場合は `--version <version>` を渡してください。リビルドされたペイロードは、ランチャーが書き換えられる前に `--version` のヘルスチェックに合格する必要があります。

## プロジェクト構成

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD renderer + config loader
│     ├─ vendor/toml.js              # vendored TOML parser (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # regenerates vendor/toml.js
   └─ install-patched-codex.js
```

## ロードマップ

- Codex がプラグイン向けに安定したローカルのセッション状態 API を公開した場合、より充実したセッショントランスクリプトの要約を追加する。
- 上流の Codex のステータスライン変更を追跡し、サポートされたカスタムレンダラーが登場した場合にパッチを廃止できるようにする。
- Codex プラグインディレクトリのカードが公開準備できた段階でスクリーンショットを追加する。

## 貢献

Issue とプルリクエストを歓迎します。HUD 出力を変更した後は `npm test` と Codex プラグインバリデーターを実行してください。マニフェストのバージョンを変更した後は `codex plugin add codex-hud@codex-hud` でローカルプラグインを再インストールしてください。

## ライセンス

[MIT](LICENSE) © Brandon Wie
