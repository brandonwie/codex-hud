**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어 | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**OpenAI Codex CLI를 위한 워크스페이스 HUD — 독립 실행형 명령은 멀티라인 워크스페이스 스냅샷을 출력할 수 있지만, 실험적 패치 Codex TUI 푸터는 현재 컴팩트한 단일 줄 상태 라인만 렌더링합니다.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Built with Rust](https://img.shields.io/badge/Built_with-Rust-dea584?style=for-the-badge&logo=rust&logoColor=white)](rust/Cargo.toml)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#설정)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#빠른-시작)

[주요 기능](#주요-기능) · [빠른 시작](#빠른-시작) · [설정](#설정) · [패치된 Codex 푸터](#실험-기능-패치된-codex-푸터) · [로드맵](#로드맵)

</div>

---

Codex HUD는 OpenAI Codex CLI 세션을 위한 멀티라인 워크스페이스 HUD를 렌더링하는 로컬 Codex 플러그인입니다.

기본적으로 이는 Codex의 네이티브 `[tui].status_line`을 보완하는 도구입니다. 기본 Codex는 입력 영역 아래에 임의의 플러그인 출력을 렌더링할 수 없기 때문입니다 — 설정 가능한 내장 상태 항목 배열은 제공하지만 플러그인이 소유하는 렌더러는 제공하지 않습니다. 이 저장소는 컴팩트 상태 라인을 실제 Codex 푸터에 직접 렌더링하기를 원하는 사용자를 위해 유지 관리되는 패치 경로도 함께 제공합니다.

다음은 `--line`이 출력하는 간결한 상태 라인입니다(TUI 내부 푸터로는 패치 모드에서만 렌더링됩니다):

```text
5.6-sol|h|f|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> 해당 라인의 세그먼트, 라벨, 색상, 임계값은 모두 설정할 수 있습니다 — [설정](#설정)을 참고하세요.

기본 상태 라인 렌더러는 작은 네이티브 Rust 바이너리인 `codex-hud`입니다(edition 2021, MIT). 렌더링 경로에 인터프리터가 끼어들지 않는 단일 자기완결형 실행 파일이며, 의존성이 최소(`serde_json`과 `toml`뿐)이고, `unsafe` 코드가 전혀 없으며, 크기를 최적화한 릴리스 빌드는 약 574 KB입니다. 혼동을 막기 위해 짚어 두자면, 이 README에는 서로 다른 "Rust"가 두 개 등장합니다. 업스트림 Codex CLI 자체가 Rust 프로그램이고(아래 실험적 패치의 빌드 대상), `codex-hud`는 이와 별개로 저장소 안에 있는 상태 라인 렌더러입니다.

## 주요 기능

- Codex 버전, 모델, 추론 강도(reasoning effort), 샌드박스, 승인 모드
- 네이티브 Codex 상태 라인 항목 개수와 색상 설정
- Codex 롤아웃 로그에서 파싱한 간결한 사용량 — 위의 간결 라인(패치 모드에서는 TUI 내부 푸터)
- 현재 작업 디렉터리, git 브랜치, 변경된 파일 개수, 저장소 루트
- 패키지 이름, 인접한 `AGENTS.md`, 존재할 경우 3B `ACTIVE-STATUS.md` 우선순위 같은 프로젝트 힌트
- `hooks.json`에서 가져온 Codex 훅 이벤트 개수
- 실시간 토큰 및 사용량 제한(rate-limit) 값은 Codex의 네이티브 상태 라인이 여전히 권위 있는 출처임을 알리는 명확한 안내

## 빠른 시작

### 한 줄 설치

가장 빠른 방법입니다. 소스에서 빌드하므로 `PATH`에 `git`, `node`, Rust 툴체인(`cargo`)이 있어야 하고, 동작하는 `codex`도 필요합니다:

```bash
curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | bash
```

이 명령은 고정된 릴리스를 클론하고, `codex-hud` 렌더러를 빌드하며, 스톡 위임 런처를 설치하고, 플러그인을 등록합니다 — 기존 `codex` 명령은 건드리지 **않습니다**. `codex`까지 HUD 런처로 해석되게 하려면 스크립트를 실행하는 셸에 플래그를 전달하세요: `curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | CODEX_HUD_MAKE_DEFAULT=1 bash`. 아무것도 변경하지 않고 미리 보려면 `bash install.sh --dry-run`을 실행하세요(또는 `CODEX_HUD_DRY_RUN=1`을 설정하세요). 실행 전에 내용을 검토하려면 `curl -fsSLO https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh`로 내려받아 읽어 본 다음 `bash install.sh`를 실행하세요.

Rust 툴체인이 없거나 수동으로 직접 제어하고 싶다면 아래의 단계별 설치를 사용하세요.

저장소를 클론한 다음, 로컬 Codex 플러그인으로 설치합니다.

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# 이 저장소를 로컬 플러그인 마켓플레이스로 등록한 다음, 플러그인을 추가합니다:
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

다음으로 HUD 런처를 설치하세요(권장). 기본 모드는 **실제 Codex 설치에 위임**하므로 Homebrew/npm Codex 업데이트가 자동으로 반영됩니다 — 재빌드도, 패치된 바이너리도 필요 없습니다. 한 가지 분명히 하자면, 스톡 위임 런처는 TUI 내부 푸터를 렌더링하지 **않습니다** — 안전한 위임과 관리형 `codex` 심을 제공할 뿐이며, TUI 내부 푸터는 아래의 실험적인 패치 모드에서만 존재합니다.

```bash
npm run install:launcher                    # ~/.local/bin/codex-hud-tui 설치
npm run install:launcher -- --make-default  # 선택: `codex`가 런처로 해석되게 함
rehash
```

선택적으로 Rust 상태 라인 렌더러를 빌드할 수 있습니다. 스톡으로 실행한 TUI에서는 눈에 보이는 변화가 전혀 없습니다 — 실험적인 패치 푸터를 쓰거나 `codex-hud`를 독립 실행형으로 사용할 때(`--watch`, 또는 다른 도구에 `status_line_command`를 직접 연결할 때) 의미가 있습니다. 한 번 빌드해 두면 패치 모드와 `--print-config`에서 설치기가 자동으로 인식합니다(`--renderer auto`):

```bash
npm run build:rust   # 선택: rust/target/release/codex-hud 빌드
```

자세한 내용은 아래 HUD 런처 섹션을, 진단은 `npm run doctor`를 참고하세요.

설치하거나 재설치한 후에는 스킬 목록이 새로고침되도록 새로운 Codex 스레드를 시작하세요.

> **팁:** `codex plugin marketplace add "$(pwd)"`는 현재 디렉터리를 읽으므로 저장소 루트에서 실행하세요. `"$(pwd)"` 대신 명시적인 경로를 전달할 수도 있습니다.

## 사용법

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # 독립 실행형 멀티라인 스냅샷
./rust/target/release/codex-hud --line     # 단일 간결 라인
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # 기계가 읽을 수 있는 형식
./rust/target/release/codex-hud --watch 5   # 5초마다 새로고침
npm test
```

간결한 상태 라인(`--line`)의 터미널 캡처:

```text
$ ./rust/target/release/codex-hud --line
5.6-sol|h|f|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud`(`npm run build:rust` 이후)는 동일한 플래그 집합을 제공합니다 — `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`:

```bash
./rust/target/release/codex-hud --line --color
```

## 설정

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # ~/.codex/codex-hud.toml 스캐폴딩 (--force로 덮어쓰기)
codex-hud --print-config    # 해석되어 병합된 설정을 JSON으로 출력
codex-hud --config-path     # 어떤 설정 파일이 적용 중인지 표시
```

### 검색 순서

뒤에 오는 소스가 앞의 소스를 재정의합니다(키 단위로 — 배열은 교체, 스칼라는 재정의).

1. 내장 기본값
2. `$CODEX_HOME/codex-hud.toml` (사용자별; `$CODEX_HOME`의 기본값은 `~/.codex`)
3. `./.codex/codex-hud.toml` (프로젝트별; git 루트까지 상위로 탐색)
4. `$CODEX_HUD_CONFIG` (환경 변수를 통한 명시적 파일 경로)

파일이 없어도 괜찮습니다. 형식이 잘못되었거나 유효하지 않은 파일은 무시됩니다 — HUD는 기본값으로 폴백하고 stderr에 한 줄짜리 안내를 출력하므로 상태 라인이 깨지는 일은 없습니다. codex-hud는 Codex의 `config.toml` 내부 테이블 대신 자체 파일을 유지하므로, 잘못된 HUD 설정이 Codex 실행을 막는 일은 결코 없습니다.

### 옵션

```toml
# 기본은 간결한 형식. " | " 세그먼트 간격과 ": " 라벨을 원하면 true로 설정하세요.
space = false

# 세그먼트 사이에 들어가는 텍스트. space 플래그가 이 텍스트 주변의 패딩을 제어합니다.
separator = "|"

# 표시할 세그먼트와 순서. Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# 별칭: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX"는 사용 가능하지만 기본적으로 꺼져 있습니다 — 사용하려면 추가하세요.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# 세그먼트의 라벨 이름 변경 (키는 세그먼트 id).
[labels]
ctx = "Ctx"

# 색상: 팔레트 이름, 256색 코드(0-255), 또는 "#rrggbb"(가장 가까운
# 256색으로 매핑됨). 이름: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit은 ctx / 5h / 7d가 공유하는 임계값 색상입니다.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# ctx/5h/7d를 ok/warn/crit 사이에서 전환하는 퍼센트 임계값(0-100).
[thresholds.percent]
warn = 70
crit = 90

# 포맷팅 토글.
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> 합계만, (I:.. O:.. C:..) 숨김
pace = true     # false -> hide the pace % in 5h/7d
pacePrefix = true   # false -> 페이스 아이콘(🐢/👾/🔥)을 숨기고 %는 유지
identityShort = true # false -> gpt-5.6-sol|high|fast instead of 5.6-sol|h|f
fastMode = false
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

페이스 표시는 사용량을 균등 소모 속도와 비교합니다. slow는 `thresholds.pace.crit`보다 더 뒤처진 상태, fast는 `thresholds.pace.crit`보다 더 앞선 상태, 그 사이 구간은 normal입니다. 해석된 전체 옵션 집합을 보려면 `codex-hud --print-config`를 실행하세요.

## 플랫폼 지원

지원되는 런처 흐름은 macOS와 Linux 셸을 대상으로 합니다. WSL은 경로가 Linux 파일시스템을 통해 해석될 때 동작할 수 있지만, 관리형 런처가 Bash 스크립트이므로 네이티브 Windows 셸은 지원하지 않습니다.

## HUD 런처 (스톡 위임 — 기본값)

`npm run install:launcher`는 `~/.local/bin/codex-hud-tui`를 설치합니다. 이 작은 런처는 실제(스톡) Codex 설치를 찾아 `exec -a codex`로 실행하므로, Herdr 같은 터미널 통합이 해당 창을 계속 Codex 세션으로 인식합니다. 스톡 바이너리 경로는 설치 시점에 기록되며, 경로가 사라지면 `PATH`에서 Codex를 다시 탐색하는 런타임 폴백이 동작합니다(HUD가 관리하는 항목은 모두 건너뛰므로 런처가 자기 자신을 재귀 실행할 수 없습니다).

런처가 스톡 Codex에 위임하기 때문에:

- Homebrew/npm Codex 업데이트가 자동으로 반영됩니다 — 재빌드가 필요 없습니다.
- Homebrew/스톡 Codex 파일은 절대 수정되거나 교체되지 않습니다.
- `npm run install:launcher -- --make-default`는 관리형 `~/.local/bin/codex` 심을 설치합니다. 관리형이 아닌 기존 `codex`는 `--force-shim`을 전달하지 않는 한 교체를 거부합니다.

관리형 심만 제거하려면:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor`는 실행 체인 전체 상태를 출력합니다 — 심, 런처 모드(stock/patched/legacy), 스톡 Codex 경로와 버전, 렌더러 상태, 패치 페이로드 버전, 최신 여부, 남은 잔여 파일:

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

활성 진입 체인이 손상된 경우에만 0이 아닌 코드로 종료합니다 — 렌더러 상태 저하만으로 healthy 상태가 뒤집히는 일은 없습니다. 렌더러 재빌드 권고는 릴리스 단위로 동작합니다. 컴파일 시점의 `codex-hud` 버전을 `package.json`과 비교하므로, 릴리스로 버전이 올라갈 때 발동하며 커밋마다 발동하지는 않습니다.

## 문제 해결

먼저 `npm run doctor`를 실행하세요. shim이 없거나, 스톡 Codex를 찾지 못하거나, 패치된 런타임이 오래되었거나, 설정이 적용되지 않거나, Rust 렌더러가 없으면 Doctor가 지적한 체인 구간을 먼저 고친 뒤 해당 설치 또는 빌드 명령을 다시 실행하세요.

### 이전 codex-hud 설치에서 마이그레이션

이전에 `npm run patch:codex`(과거 기본 흐름)를 사용했다면 `npm run install:launcher`를 한 번 실행하세요. `codex-hud-tui`를 스톡 위임 방식으로 다시 작성하고 기존 `codex` 심은 그대로 유지합니다. 정상 동작하는 레거시 `codex-hud-codex` 명령은 그대로 남기고(구버전이 될 수 있다는 안내와 함께), 손상된 명령은 `codex-hud-codex.broken-<timestamp>`로 격리해 실행 중 죽는 대신 빠르게 실패하게 합니다. 다음 `npm run patch:codex` 실행 시 레거시 평면 페이로드는 버전별 레이아웃으로 자동 마이그레이션됩니다. 남은 항목은 `npm run doctor`로 확인하세요.

## 실험 기능: 패치된 Codex 푸터

> **경고 — 실험 기능입니다.** 이 모드는 로컬에서 패치한 서명되지 않은 Codex 바이너리를 빌드합니다. macOS가 서명되지 않은 재빌드를 종료시킬 수 있고(설치기는 활성화 *전에* 모든 페이로드를 헬스 체크하므로, 빌드 실패가 활성 `codex`를 망가뜨리지는 못합니다), 패치된 바이너리는 **스톡 Codex가 업데이트되면 구버전이 됩니다** — Codex 업데이트 후 `npm run patch:codex`를 다시 실행해야 합니다. TUI 내부 푸터가 꼭 필요한 경우가 아니라면 기본 스톡 위임 런처를 사용하세요.

기본 Codex는 입력 영역 아래에 임의의 플러그인 출력을 렌더링할 수 없습니다. Claude HUD 스타일의 푸터를 사용하려면 별도의 패치된 Codex 명령을 빌드하세요:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

Patched mode also passes live session state to the HUD renderer through four stable environment variables: `CODEX_HUD_MODEL`, `CODEX_HUD_EFFORT`, `CODEX_HUD_SERVICE_TIER`, and `CODEX_HUD_ROLLOUT_PATH`. `CODEX_HUD_ROLLOUT_PATH` is always present in patched mode; an empty value means Codex has not opened a rollout yet, so context and token segments stay hidden instead of falling back to another session. Live `/model`, reasoning, and `/fast` changes are reflected immediately. Rate-limit segments stay global because Codex reports those limits account-wide, so they continue to use the newest rollout file.

안전 런처 모드는 일반 `codex` 명령을 건드리지 않습니다:

```bash
codex-hud-tui
```

새 `codex` 실행이 HUD가 활성화된 TUI를 사용하게 하려면 관리형 심을 옵트인하세요:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex`가 `~/.local/bin/codex`로 해석되어야 합니다. 설치기는 `--force-shim`을 전달하지 않는 한 기존 `~/.local/bin/codex` 교체를 거부하고, `--replace-codex`를 전달하지 않는 한 패치된 바이너리 자체를 `codex`로 설치하는 것도 거부합니다.

롤백은 관리형 `codex` 심만 제거합니다:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

영구 설정을 선호한다면 출력된 라인을 기존 `[tui]` 테이블 아래에 추가하세요. 다만 스톡 Codex 버전은 알 수 없는 필드를 거부할 수 있습니다. 저장소 루트에서 머신에 맞는 정확한 라인을 생성하세요(`node scripts/install-patched-codex.js --print-config`는 설치기와 동일한 방식으로 렌더러를 결정합니다):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

그다음 `~/.codex/config.toml`의 `[tui]` 아래에 붙여넣으세요:

```toml
# /Users/you를 사용자의 홈 디렉터리로 교체하세요.
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

`codex-hud-tui`를 실행하면 컴팩트 푸터를 볼 수 있습니다. 패치된 바이너리는 스톡 Codex 업데이트를 따라가지 않습니다. 빌드 후 스톡 Codex가 변경되면 패치 런처가 실행 시 한 줄 경고를 출력합니다(옵트인한 패치 바이너리는 계속 실행합니다) — `npm run patch:codex`로 재빌드하거나 `npm run install:launcher`로 스톡 위임으로 돌아가세요. 모든 재빌드는 스테이징 → 헬스 체크 → 원자적 활성화 순서로 진행되며, 이전 정상 버전은 롤백용으로 `~/.local/bin/codex-hud-codex.d/` 아래에 남고 `npm run doctor`가 구버전 여부와 손상된 페이로드를 보고합니다. 관리형 `codex` 심이 활성화된 경우 설치기는 기준 Codex 버전을 감지할 때 해당 심을 건너뛰고 `PATH`의 다음 실제 `codex`를 사용합니다. 재빌드 대상을 명시적으로 고정해야 하면 `--version <version>`을 전달하세요.
## 프로젝트 구조

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # codex-hud 소스 (기본 상태 라인 렌더러)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## 로드맵

- Codex가 플러그인을 위한 안정적인 로컬 세션 상태 API를 노출하면 더 풍부한 세션 트랜스크립트 요약을 추가합니다.
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- 업스트림 OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827)를 추적합니다. 2026-06-10 기준 기본 Codex에는 내장 `[tui].status_line` 항목이 있지만 명령 기반 또는 플러그인 소유 렌더러는 없습니다. 지원되는 커스텀 렌더러가 출시된 경우에만 이 패치를 폐기하세요.
- 한 줄 설치기가 로컬 Rust 빌드를 건너뛸 수 있도록 SHA-256 체크섬과 함께 사전 빌드된 `codex-hud` 릴리스 바이너리를 배포합니다.

## 기여하기

이슈와 풀 리퀘스트를 환영합니다. 기여 워크플로와 전체 메인테이너 스크립트 레퍼런스는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
