**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | Русский | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**HUD рабочего пространства для OpenAI Codex CLI — автономные команды могут выводить многострочный снимок рабочего пространства; экспериментальный patched-footer в Codex TUI сейчас показывает только компактную однострочную строку статуса.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#конфигурация)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#быстрый-старт)

[Возможности](#возможности) · [Быстрый старт](#быстрый-старт) · [Конфигурация](#конфигурация) · [Пропатченный футер Codex](#экспериментально-пропатченный-футер-codex) · [Дорожная карта](#дорожная-карта)

</div>

---

Codex HUD — это локальный плагин Codex с двумя поверхностями: автономные команды могут печатать многострочный снимок рабочего пространства, а экспериментальная patched Codex TUI может выводить компактный `--line` как однострочный футер.

По умолчанию он работает как дополнение к встроенному `[tui].status_line` в Codex, поскольку штатный Codex не умеет отображать произвольный вывод плагинов под областью ввода — он предоставляет настраиваемый массив встроенных элементов статуса, но не отрисовщик, управляемый плагином. В этом репозитории также есть поддерживаемый путь патчинга для пользователей, которые хотят выводить компактную строку статуса прямо в настоящем футере Codex.

Компактная строка статуса, которую печатает `--line` (футером внутри TUI она становится только в пропатченном режиме):

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Сегменты, метки, цвета и пороговые значения в этой строке полностью настраиваются — см. [Конфигурация](#конфигурация).

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

## Возможности

- Версия Codex, модель, уровень рассуждений, песочница и режим подтверждения
- Количество и цвет встроенных элементов строки статуса Codex
- Компактный расход, разобранный из журналов раскатки (rollout) Codex — компактная строка из примера выше (футер внутри TUI в пропатченном режиме)
- Текущий рабочий каталог, ветка git, счётчики незакоммиченных изменений и корень репозитория
- Подсказки по проекту, такие как имя пакета, ближайший `AGENTS.md` и приоритет из 3B `ACTIVE-STATUS.md`, когда он есть
- Счётчики событий хуков Codex из `hooks.json`
- Чёткое уведомление о том, что встроенная строка статуса Codex остаётся авторитетной для актуальных значений токенов и лимитов скорости

## Быстрый старт

Клонируйте репозиторий, затем установите его как локальный плагин Codex:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Зарегистрируйте этот репозиторий как локальный маркетплейс плагинов, затем добавьте плагин:
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

Затем установите лаунчер HUD (рекомендуется). Режим по умолчанию **делегирует вашей настоящей установке Codex**, поэтому обновления Codex через Homebrew/npm подхватываются автоматически — без пересборок и пропатченных бинарников. Для ясности: лаунчер с делегированием стоковому Codex **не** отрисовывает футер внутри TUI — он даёт безопасное делегирование плюс управляемый шим `codex`; футер внутри TUI существует только в экспериментальном пропатченном режиме, описанном ниже.

```bash
npm run install:launcher                    # устанавливает ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # опционально: `codex` будет указывать на лаунчер
rehash
```

Опционально соберите Rust-отрисовщик строки статуса. В TUI, запущенном в стоковом режиме, это ничего видимого не меняет — сборка важна для экспериментального пропатченного футера и для автономного использования `codex-hud` (`--watch` или ручное подключение `status_line_command` к другим инструментам). После сборки установщик автоматически подхватывает отрисовщик (`--renderer auto`) для пропатченного режима и `--print-config`:

```bash
npm run build:rust   # опционально: собирает rust/target/release/codex-hud
```

Подробности — в разделе «Лаунчер HUD» ниже; диагностика — `npm run doctor`.

Запустите новый поток Codex после установки или переустановки, чтобы список навыков обновился.

> **Совет:** `codex plugin marketplace add "$(pwd)"` считывает текущий каталог, поэтому запускайте команду из корня репозитория. Вместо `"$(pwd)"` можно также передать явный путь.

## Использование

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # автономный многострочный снимок
./rust/target/release/codex-hud --line     # одна компактная строка
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # машиночитаемый вывод
./rust/target/release/codex-hud --watch 5   # обновление каждые 5 с
npm test
```

Терминальный снимок компактной строки статуса (`--line`):

```text
$ ./rust/target/release/codex-hud --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud` (после `npm run build:rust`) предоставляет идентичный набор флагов — `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`:

```bash
./rust/target/release/codex-hud --line --color
```

## Конфигурация

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # создать заготовку ~/.codex/codex-hud.toml (--force для перезаписи)
codex-hud --print-config    # вывести итоговую объединённую конфигурацию в формате JSON
codex-hud --config-path     # показать, какие файлы конфигурации действуют
```

### Порядок поиска

Более поздние источники переопределяют более ранние (по каждому ключу — массивы заменяются, скаляры переопределяются):

1. встроенные значения по умолчанию
2. `$CODEX_HOME/codex-hud.toml` (для пользователя; `$CODEX_HOME` по умолчанию `~/.codex`)
3. `./.codex/codex-hud.toml` (для проекта; поднимается вверх до корня git)
4. `$CODEX_HUD_CONFIG` (явный путь к файлу через переменную окружения)

Отсутствие файла — это нормально. Некорректный или недопустимый файл игнорируется — HUD возвращается к значениям по умолчанию и выводит однострочное уведомление в stderr, поэтому строка статуса никогда не ломается. codex-hud хранит собственный файл вместо таблицы внутри `config.toml` от Codex, так что плохая конфигурация HUD никогда не помешает запуску Codex.

### Параметры

```toml
# По умолчанию компактно. Установите true для разделения сегментов " | " и меток ": ".
space = false

# Текст, помещаемый между сегментами. Флаг space управляет отступами вокруг этого текста.
separator = "|"

# Какие сегменты показывать и в каком порядке. Идентификаторы:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Псевдонимы: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" доступен, но по умолчанию выключен — добавьте его, чтобы включить.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Переименовать метку сегмента (ключи — это идентификаторы сегментов).
[labels]
ctx = "Ctx"

# Цвета: имя палитры, код 256-цветной палитры (0-255) или "#rrggbb" (сопоставляется с
# ближайшим из 256 цветов). Имена: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit — пороговые цвета, общие для ctx / 5h / 7d.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Процентные пороги (0-100), которые переключают ctx/5h/7d между ok/warn/crit.
[thresholds.percent]
warn = 70
crit = 90

# Переключатели форматирования.
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> только итог, скрыть (I:.. O:.. C:..)
pace = true     # false -> hide the pace % in 5h/7d
modelShort = true # false -> gpt-5.5 вместо 5.5
effortShort = false # true -> xh вместо xhigh
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

Маркеры темпа сравнивают использование с равномерной скоростью расхода: slow означает отставание от темпа более чем на `thresholds.pace.crit`, fast означает опережение более чем на `thresholds.pace.crit`, а средний диапазон считается normal. Запустите `codex-hud --print-config`, чтобы увидеть полный итоговый набор параметров.

## Поддержка платформ

Поддерживаемый сценарий лаунчера рассчитан на shell-окружения macOS и Linux. WSL может работать, если пути разрешаются через файловую систему Linux; нативные Windows shell не поддерживаются, потому что управляемые лаунчеры являются Bash-скриптами.

## Лаунчер HUD (делегирование стоковому Codex — режим по умолчанию)

`npm run install:launcher` записывает `~/.local/bin/codex-hud-tui` — небольшой лаунчер, который находит вашу настоящую (стоковую) установку Codex и запускает её через `exec -a codex`, поэтому терминальные интеграции вроде Herdr по-прежнему распознают панель как сессию Codex. Путь к стоковому бинарнику фиксируется при установке; если он исчезает, срабатывает рантайм-фолбэк, заново ищущий Codex в `PATH` (все управляемые HUD записи пропускаются, поэтому лаунчер никогда не запустит сам себя рекурсивно).

Поскольку лаунчер делегирует стоковому Codex:

- Обновления Codex через Homebrew/npm подхватываются автоматически — без пересборок.
- Ваши файлы Homebrew/стокового Codex никогда не изменяются и не заменяются.
- `npm run install:launcher -- --make-default` устанавливает управляемый шим `~/.local/bin/codex`; установщик откажется заменять неуправляемый `codex`, если не передать `--force-shim`.

Удалить только управляемый шим:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` выводит полное состояние цепочки запуска — шим, режим лаунчера (stock/patched/legacy), путь и версию стокового Codex, состояние отрисовщика, версии пропатченных пэйлоадов, устаревание и оставшиеся артефакты:

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

Ненулевой код возврата — только когда активная цепочка запуска сломана; деградация отрисовщика никогда не меняет статус healthy. Рекомендация о пересборке отрисовщика действует с точностью до релиза: версия `codex-hud`, зашитая при компиляции, сравнивается с `package.json`, поэтому рекомендация срабатывает, когда релиз сдвигает версию, а не на каждом коммите.

## Устранение неполадок

Начните с `npm run doctor`. Если shim отсутствует, стоковый Codex не найден, патченный runtime устарел, конфигурация не применяется или Rust-рендерер отсутствует, сначала исправьте звено цепочки, указанное Doctor, затем повторно выполните соответствующую команду установки или сборки.

### Миграция со старой установки codex-hud

Если раньше вы запускали `npm run patch:codex` (старый поток по умолчанию), выполните один раз `npm run install:launcher`: он перепишет `codex-hud-tui` на делегирование стоковому Codex, а ваш существующий шим `codex` продолжит работать. Исправный устаревший `codex-hud-codex` остаётся на месте (с пометкой об устаревании); сломанный отправляется в карантин как `codex-hud-codex.broken-<timestamp>` и быстро падает вместо смерти посреди запуска. Следующий `npm run patch:codex` автоматически перенесёт старый плоский пэйлоад в версионированную раскладку. Всё оставшееся покажет `npm run doctor`.

## Экспериментально: пропатченный футер Codex

> **Внимание — экспериментальная функция.** Этот режим собирает локально пропатченный неподписанный бинарник Codex. macOS может убивать неподписанные пересборки (установщик проверяет каждый пэйлоад health-чеком *до* активации, поэтому неудачная сборка никогда не сломает ваш активный `codex`), а пропатченный бинарник **устаревает при обновлении стокового Codex** — после обновлений Codex нужно заново запускать `npm run patch:codex`. Предпочитайте делегирующий лаунчер по умолчанию, если вам не нужен именно футер внутри TUI.

Стоковый Codex не умеет отображать произвольный вывод плагинов под областью ввода. Чтобы получить футер в стиле Claude HUD, соберите отдельную пропатченную команду Codex:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

Безопасный режим лаунчера не трогает вашу обычную команду `codex`:

```bash
codex-hud-tui
```

Чтобы новый запуск `codex` использовал TUI с HUD, явно включите управляемый шим:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` должен указывать на `~/.local/bin/codex`. Установщик откажется заменять существующий `~/.local/bin/codex` без `--force-shim` и откажется устанавливать сам пропатченный бинарник как `codex` без `--replace-codex`.

Откат удаляет только управляемый шим `codex`:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Если предпочитаете постоянную конфигурацию, добавьте выведенную строку под существующую таблицу `[tui]`, но учтите: стоковые версии Codex могут отвергать неизвестные поля. Сгенерируйте точную строку для вашей машины из корня репозитория (`node scripts/install-patched-codex.js --print-config` определяет отрисовщик так же, как установщик):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

Затем вставьте её под `[tui]` в `~/.codex/config.toml`:

```toml
# Замените /Users/you вашим домашним каталогом.
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

Запустите `codex-hud-tui`, чтобы увидеть компактный футер. Пропатченный бинарник не следует за обновлениями стокового Codex: если стоковый Codex изменился после сборки, пропатченный лаунчер печатает однострочное предупреждение при запуске (и всё равно запускает выбранный вами пропатченный бинарник) — пересоберите через `npm run patch:codex` или вернитесь к делегированию через `npm run install:launcher`. Каждая пересборка проходит стейджинг, health-чек и атомарную активацию; предыдущая рабочая версия остаётся в `~/.local/bin/codex-hud-codex.d/` для отката, а `npm run doctor` сообщает об устаревании и сломанных пэйлоадах. Когда управляемый шим `codex` активен, установщик пропускает его при определении базовой версии Codex и использует следующий настоящий `codex` в `PATH`; передайте `--version <version>`, если нужно явно зафиксировать цель пересборки.
## Структура проекта

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # исходники codex-hud (отрисовщик строки статуса по умолчанию)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## Дорожная карта

- Добавить более насыщенные сводки стенограмм сессий, если Codex предоставит стабильный локальный API состояния сессии для плагинов.
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- Отслеживать upstream-issue OpenAI Codex [#17827](https://github.com/openai/codex/issues/17827). По состоянию на 2026-06-10 стандартный Codex имеет встроенные элементы `[tui].status_line`, но не имеет командного или принадлежащего плагину отрисовщика; упраздняйте патч только после выхода поддерживаемого пользовательского отрисовщика.

## Участие в разработке

Issue и pull request приветствуются. После изменения вывода HUD запустите `npm test` и валидатор плагинов Codex. После изменения версии манифеста или выпуска release обновите локальный кеш плагина для ручного тестирования командой `codex plugin add brandonwie@codex-hud`, затем начните новый поток Codex, чтобы загрузить обновленные метаданные skill.

### Скрипты сопровождающего

Основные команды сопровождения: `npm test`, `npm run test:rust`, `npm run check:i18n`, `npm run doctor`, `npm run sync:version` и .

## Лицензия

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
