**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어 | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**OpenAI Codex CLI를 위한 간결하고 색상이 입혀진 워크스페이스 HUD — 모델, 프로젝트, git, 컨텍스트, 5h/7d 사용량을 단일 푸터 라인에 표시합니다.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#설정)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#빠른-시작)

[주요 기능](#주요-기능) · [빠른 시작](#빠른-시작) · [설정](#설정) · [패치된 Codex 푸터](#패치된-codex-푸터) · [로드맵](#로드맵)

</div>

---

Codex HUD는 OpenAI Codex CLI 세션을 위한 멀티라인 워크스페이스 HUD를 렌더링하는 로컬 Codex 플러그인입니다.

기본적으로 이는 Codex의 네이티브 `[tui].status_line`을 보완하는 도구입니다. 기본 Codex는 설정 가능한 내장 상태 항목 배열을 제공하지만 플러그인이 소유하는 렌더러는 제공하지 않기 때문입니다. 이 저장소는 HUD 스크립트를 실제 Codex 푸터에 직접 렌더링하기를 원하는 사용자를 위해 유지 관리되는 패치 경로도 함께 제공합니다.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> 해당 라인의 세그먼트, 라벨, 색상, 임계값은 모두 설정할 수 있습니다 — [설정](#설정)을 참고하세요.

## 주요 기능

- Codex 버전, 모델, 추론 강도(reasoning effort), 샌드박스, 승인 모드
- 네이티브 Codex 상태 라인 항목 개수와 색상 설정
- Codex 롤아웃 로그에서 파싱한 간결한 사용량(위 예시 푸터)
- 현재 작업 디렉터리, git 브랜치, 변경된 파일 개수, 저장소 루트
- 패키지 이름, 인접한 `AGENTS.md`, 존재할 경우 3B `ACTIVE-STATUS.md` 우선순위 같은 프로젝트 힌트
- `hooks.json`에서 가져온 Codex 훅 이벤트 개수
- 실시간 토큰 및 사용량 제한(rate-limit) 값은 Codex의 네이티브 상태 라인이 여전히 권위 있는 출처임을 알리는 명확한 안내

## 빠른 시작

저장소를 클론한 다음, 로컬 Codex 플러그인으로 설치합니다.

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# 이 저장소를 로컬 플러그인 마켓플레이스로 등록한 다음, 플러그인을 추가합니다:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

설치하거나 재설치한 후에는 스킬 목록이 새로고침되도록 새로운 Codex 스레드를 시작하세요.

> **팁:** `codex plugin marketplace add "$(pwd)"`는 현재 디렉터리를 읽으므로 저장소 루트에서 실행하세요. `"$(pwd)"` 대신 명시적인 경로를 전달할 수도 있습니다.

## 사용법

개발 중에는 렌더러를 직접 실행할 수 있습니다.

```bash
node plugins/codex-hud/scripts/codex-hud.js           # 멀티라인 HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # 단일 간결 라인
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # 기계가 읽을 수 있는 형식
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # 5초마다 새로고침
npm test
```

기본 간결 푸터의 터미널 캡처:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

ANSI 색상 스타일이 적용된 같은 푸터를 보려면 로컬에서 `node plugins/codex-hud/scripts/codex-hud.js --line --color`를 실행하세요.

## 설정

푸터는 선택적인 `codex-hud.toml`을 통해 설정할 수 있습니다. 설정 파일이 없으면 위에 표시된 기본 푸터가 적용되며, 모든 키는 선택 사항이고 생략한 항목은 내장 기본값을 상속합니다.

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
tokenParts = true   # false -> 합계만, (I:.. O:.. C:..) 숨김
showPace = true     # false -> 5h/7d의 pace % 숨김
```

해석된 전체 옵션 집합을 보려면 `codex-hud --print-config`를 실행하세요.

## 패치된 Codex 푸터

기본 Codex는 입력 영역 아래에 임의의 플러그인 출력을 렌더링할 수 없습니다. Claude HUD 스타일의 푸터를 얻으려면 별도의 패치된 Codex 명령을 빌드하세요.

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

설치 프로그램은 일치하는 OpenAI Codex 태그를 패치하고 Rust CLI를 빌드한 다음, 실제 실행 파일을 `~/.local/bin/codex-hud-codex.d/codex`에 보관하며 `~/.local/bin/codex-hud-codex`를 해당 바이너리에 대한 심링크로 둡니다. 또한 `~/.local/bin/codex-hud-tui`를 작성합니다. 이는 `~/.codex/config.toml`을 변경하지 않고 Codex의 `-c tui.status_line_command=...` 재정의를 통해 색상이 입혀진 HUD 명령을 전달하는 런처입니다. 실행 파일 경로와 `argv[0]`는 모두 Codex가 인식할 수 있는 이름을 유지하므로, Herdr 같은 터미널 통합 도구가 여전히 해당 페인(pane)을 Codex 세션으로 인식할 수 있습니다.

안전 런처 모드는 평소의 `codex` 명령을 그대로 둡니다.

```bash
codex-hud-tui
```

새로운 `codex` 실행 시 HUD가 활성화된 TUI를 사용하려면, 관리형 shim을 사용하도록 설정하세요.

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex`는 `~/.local/bin/codex`로 해석되어야 합니다. 설치 프로그램은 `--force-shim`을 전달하지 않는 한 기존 `~/.local/bin/codex`를 교체하지 않으며, `--replace-codex`를 전달하지 않는 한 패치된 바이너리 자체를 `codex`로 설치하는 것도 거부합니다.

롤백은 관리형 `codex` shim만 제거합니다.

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

지속적인 설정을 선호한다면 기존 `[tui]` 테이블 아래에 출력된 라인을 추가하세요. 다만 기본 Codex 버전이 알 수 없는 필드를 거부할 수 있다는 점에 유의하세요. 저장소 루트에서 사용자의 머신에 맞는 정확한 라인을 생성하세요.

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

그런 다음 `~/.codex/config.toml`의 `[tui]` 아래에 붙여넣으세요.

```toml
# /path/to/codex-hud를 로컬 클론 경로로 교체하세요.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

`codex-hud-tui`를 실행하면 간결한 푸터를 볼 수 있습니다. Homebrew나 Codex 업데이트는 이 별도의 명령을 업데이트하지 않으니, Codex를 업데이트한 후에는 `npm run patch:codex`를 다시 실행하세요. 관리형 `codex` shim이 활성화되어 있으면, 설치 프로그램은 기본 Codex 버전을 감지하는 동안 해당 shim을 건너뛰고 `PATH`상의 다음 실제 `codex`를 사용합니다. 리빌드 대상을 명시적으로 고정해야 한다면 `--version <version>`을 전달하세요. 리빌드된 페이로드는 런처가 다시 작성되기 전에 `--version` 헬스 체크를 통과해야 합니다.

## 프로젝트 구조

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD 렌더러 + 설정 로더
│     ├─ vendor/toml.js              # 벤더링된 TOML 파서 (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # vendor/toml.js를 재생성
   └─ install-patched-codex.js
```

## 로드맵

- Codex가 플러그인을 위한 안정적인 로컬 세션 상태 API를 노출하면 더 풍부한 세션 트랜스크립트 요약을 추가합니다.
- 업스트림 OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827)를 추적합니다. 2026-06-10 기준 기본 Codex에는 내장 `[tui].status_line` 항목이 있지만 명령 기반 또는 플러그인 소유 렌더러는 없습니다. 지원되는 커스텀 렌더러가 출시된 경우에만 이 패치를 폐기하세요.

## 기여하기

이슈와 풀 리퀘스트를 환영합니다. HUD 출력을 변경한 후에는 `npm test`와 Codex 플러그인 검증기를 실행하세요. 매니페스트 버전을 변경하거나 릴리스한 후에는 수동 테스트를 위해 `codex plugin add codex-hud@codex-hud`로 로컬 플러그인 캐시를 새로고침하고, 업데이트된 스킬 메타데이터를 불러오도록 새 Codex 스레드를 시작하세요.

## 라이선스

[MIT](LICENSE) © Brandon Wie
