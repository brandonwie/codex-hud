**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | Tiếng Việt | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**HUD workspace cho OpenAI Codex CLI — các lệnh độc lập có thể hiển thị snapshot workspace nhiều dòng; footer Codex TUI ở chế độ vá thử nghiệm hiện chỉ render status line nhỏ gọn một dòng.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Built with Rust](https://img.shields.io/badge/Built_with-Rust-dea584?style=for-the-badge&logo=rust&logoColor=white)](rust/Cargo.toml)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#cấu-hình)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#bắt-đầu-nhanh)

[Tính năng](#tính-năng) · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Cấu hình](#cấu-hình) · [Footer Codex đã vá](#thử-nghiệm-footer-codex-đã-vá) · [Lộ trình](#lộ-trình)

</div>

---

Codex HUD là một plugin Codex chạy cục bộ, hiển thị một HUD workspace nhiều dòng cho các phiên OpenAI Codex CLI.

Mặc định nó là một thành phần đồng hành với `[tui].status_line` gốc của Codex, vì Codex bản gốc không thể hiển thị đầu ra plugin tùy ý bên dưới vùng nhập — nó cung cấp một mảng các mục trạng thái tích hợp có thể cấu hình nhưng không có bộ render do plugin sở hữu. Repo này cũng đi kèm một đường dẫn vá được bảo trì cho những ai muốn status line nhỏ gọn render trực tiếp trong footer Codex thật.

Status line nhỏ gọn, được in bởi `--line` (chỉ được render thành footer trong TUI ở chế độ vá):

```text
5.6-sol|h|f|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Các segment, nhãn, màu sắc và ngưỡng trong dòng đó đều có thể cấu hình — xem [Cấu hình](#cấu-hình).

Bộ render status-line mặc định là `codex-hud`, một nhị phân Rust gốc nhỏ gọn (edition 2021, MIT): một tệp thực thi độc lập duy nhất, không có trình thông dịch nào trên đường render, dấu chân phụ thuộc tối thiểu (chỉ `serde_json` và `toml`), không một dòng mã `unsafe` nào, cùng một bản build release được tối ưu kích thước với dung lượng khoảng 574 KB. Để nói cho rõ, hai chữ "Rust" khác nhau xuất hiện trong README này: Codex CLI thượng nguồn bản thân nó là một chương trình Rust (mục tiêu build của bản vá thử nghiệm bên dưới), còn `codex-hud` là bộ render status-line riêng nằm trong repo này.

## Tính năng

- Phiên bản Codex, model, mức độ suy luận, sandbox và chế độ phê duyệt
- Số lượng mục status-line gốc của Codex và thiết lập màu
- Mức sử dụng nhỏ gọn được phân tích từ log rollout của Codex — dòng nhỏ gọn phía trên (là footer trong TUI ở chế độ vá)
- Thư mục làm việc hiện tại, nhánh git, số lượng thay đổi chưa commit và thư mục gốc của repo
- Các gợi ý về dự án như tên package, `AGENTS.md` lân cận và mức ưu tiên `ACTIVE-STATUS.md` của 3B khi có
- Số lượng sự kiện hook của Codex từ `hooks.json`
- Một ghi chú rõ ràng rằng status line gốc của Codex vẫn là nguồn chính xác cho các giá trị token và giới hạn tốc độ theo thời gian thực

## Bắt đầu nhanh

### Cài đặt một dòng

Cách nhanh nhất. Nó build từ mã nguồn, nên cần `git`, `node` và một bộ công cụ Rust (`cargo`) trên `PATH` của bạn, cùng với một `codex` đang hoạt động:

```bash
curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | bash
```

Lệnh này clone một bản release đã ghim, build bộ render `codex-hud`, cài launcher ủy quyền gốc và đăng ký plugin — nó **không** đụng tới lệnh `codex` hiện có của bạn. Để `codex` cũng trỏ tới launcher HUD, hãy truyền cờ vào shell chạy script: `curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | CODEX_HUD_MAKE_DEFAULT=1 bash`. Để xem trước mà không thay đổi gì, hãy chạy `bash install.sh --dry-run` (hoặc đặt `CODEX_HUD_DRY_RUN=1`). Để kiểm tra trước khi chạy, tải về bằng `curl -fsSLO https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh`, đọc nó, rồi chạy `bash install.sh`.

Không có bộ công cụ Rust, hoặc muốn tự kiểm soát thủ công? Hãy dùng cách cài đặt từng bước bên dưới.

Clone repo, sau đó cài đặt nó như một plugin Codex cục bộ:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Đăng ký repo này như một marketplace plugin cục bộ, rồi thêm plugin:
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

Tiếp theo, cài launcher HUD (khuyến nghị). Chế độ mặc định **ủy quyền cho bản cài Codex thật của bạn**, nên các bản cập nhật Codex qua Homebrew/npm được áp dụng tự động — không cần build lại, không có nhị phân vá. Nói rõ hơn: launcher ủy quyền gốc **không** render footer trong TUI — nó cung cấp cơ chế ủy quyền an toàn cùng shim `codex` được quản lý; footer trong TUI chỉ có ở chế độ vá thử nghiệm bên dưới.

```bash
npm run install:launcher                    # cài ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # tùy chọn: để `codex` trỏ tới launcher
rehash
```

Tùy chọn: build bộ render status-line bằng Rust. Việc này không làm thay đổi bất cứ thứ gì hiển thị trong TUI khởi chạy bằng Codex gốc — nó chỉ quan trọng với footer vá thử nghiệm và khi dùng `codex-hud` độc lập (`--watch`, hoặc tự nối `status_line_command` vào các công cụ khác). Sau khi build xong, trình cài đặt tự động nhận diện nó (`--renderer auto`) cho chế độ vá và `--print-config`:

```bash
npm run build:rust   # tùy chọn: build rust/target/release/codex-hud
```

Xem mục "Launcher HUD" bên dưới để biết chi tiết và chạy `npm run doctor` để chẩn đoán.

Bắt đầu một thread Codex mới sau khi cài đặt hoặc cài lại để danh sách skill được làm mới.

> **Mẹo:** `codex plugin marketplace add "$(pwd)"` đọc thư mục hiện tại, nên hãy chạy nó từ thư mục gốc của repo. Bạn cũng có thể truyền một đường dẫn cụ thể thay cho `"$(pwd)"`.

## Cách dùng

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # snapshot nhiều dòng độc lập
./rust/target/release/codex-hud --line     # một dòng nhỏ gọn
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # định dạng máy đọc được
./rust/target/release/codex-hud --watch 5   # làm mới mỗi 5s
npm test
```

Ảnh chụp terminal của status line nhỏ gọn (`--line`):

```text
$ ./rust/target/release/codex-hud --line
5.6-sol|h|f|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud` (sau khi chạy `npm run build:rust`) cung cấp bề mặt cờ giống hệt — `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`:

```bash
./rust/target/release/codex-hud --line --color
```

## Cấu hình

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # tạo khung ~/.codex/codex-hud.toml (--force để ghi đè)
codex-hud --print-config    # in cấu hình đã được phân giải và gộp dưới dạng JSON
codex-hud --config-path     # hiển thị những tệp cấu hình nào đang có hiệu lực
```

### Thứ tự tìm kiếm

Các nguồn sau ghi đè các nguồn trước (theo từng khóa — mảng thay thế, vô hướng ghi đè):

1. giá trị mặc định tích hợp
2. `$CODEX_HOME/codex-hud.toml` (theo từng người dùng; `$CODEX_HOME` mặc định là `~/.codex`)
3. `./.codex/codex-hud.toml` (theo từng dự án; đi ngược lên tới gốc git)
4. `$CODEX_HUD_CONFIG` (đường dẫn tệp tường minh qua biến môi trường)

Thiếu tệp thì không sao. Một tệp sai định dạng hoặc không hợp lệ sẽ bị bỏ qua — HUD quay về giá trị mặc định và in một ghi chú một dòng ra stderr, nên status line không bao giờ bị hỏng. codex-hud giữ tệp riêng của nó thay vì một bảng bên trong `config.toml` của Codex, nên một cấu hình HUD lỗi không bao giờ có thể ngăn Codex khởi chạy.

### Tùy chọn

```toml
# Nhỏ gọn theo mặc định. Đặt true để có khoảng cách segment " | " và nhãn ": ".
space = false

# Văn bản đặt giữa các segment. Cờ space điều khiển khoảng đệm quanh văn bản này.
separator = "|"

# Những segment nào hiển thị, theo thứ tự. Id:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Bí danh: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" có sẵn nhưng tắt theo mặc định — thêm vào để bật.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Đổi tên nhãn của một segment (khóa là id của segment).
[labels]
ctx = "Ctx"

# Màu sắc: tên bảng màu, mã 256-màu (0-255), hoặc "#rrggbb" (ánh xạ tới
# màu 256 gần nhất). Tên: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit là các màu ngưỡng dùng chung bởi ctx / 5h / 7d.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Ngưỡng phần trăm (0-100) để chuyển ctx/5h/7d giữa ok/warn/crit.
[thresholds.percent]
warn = 70
crit = 90

# Các công tắc định dạng.
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> chỉ tổng, ẩn (I:.. O:.. C:..)
pace = true     # false -> hide the pace % in 5h/7d
pacePrefix = true   # false -> ẩn biểu tượng pace (🐢/👾/🔥), giữ lại %
identityShort = true # false -> gpt-5.6-sol|high|fast instead of 5.6-sol|h|f
fastMode = false
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

Dấu pace so sánh mức sử dụng với tốc độ tiêu thụ đều: slow là chậm hơn pace quá `thresholds.pace.crit`, fast là nhanh hơn pace quá `thresholds.pace.crit`, và dải ở giữa là normal. Chạy `codex-hud --print-config` để xem toàn bộ tập tùy chọn đã được phân giải.

## Hỗ trợ nền tảng

Luồng launcher được hỗ trợ nhắm tới shell macOS và Linux. WSL có thể hoạt động khi đường dẫn được phân giải qua hệ thống tệp Linux; shell Windows gốc không được hỗ trợ vì các launcher được quản lý là script Bash.

## Launcher HUD (ủy quyền cho Codex gốc — mặc định)

`npm run install:launcher` ghi `~/.local/bin/codex-hud-tui`, một launcher nhỏ tìm bản cài Codex thật (gốc) của bạn và thực thi nó bằng `exec -a codex`, nhờ đó các tích hợp terminal như Herdr vẫn nhận diện pane là một phiên Codex. Đường dẫn nhị phân gốc được ghi lại lúc cài đặt, kèm cơ chế dự phòng lúc chạy sẽ tìm lại Codex trên `PATH` (bỏ qua mọi mục do HUD quản lý, nên launcher không bao giờ tự gọi đệ quy chính nó).

Vì launcher ủy quyền cho Codex gốc:

- Cập nhật Codex qua Homebrew/npm được áp dụng tự động — không cần build lại.
- Các tệp Codex gốc/Homebrew của bạn không bao giờ bị sửa hay thay thế.
- `npm run install:launcher -- --make-default` cài shim được quản lý `~/.local/bin/codex`; trình cài đặt từ chối thay thế `codex` không do nó quản lý trừ khi bạn truyền `--force-shim`.

Chỉ gỡ shim được quản lý:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` in toàn bộ trạng thái chuỗi khởi chạy — shim, chế độ launcher (stock/patched/legacy), đường dẫn + phiên bản Codex gốc, trạng thái bộ render, các phiên bản payload đã vá, độ cũ và tệp còn sót:

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

Chỉ thoát với mã khác 0 khi chuỗi điểm vào đang hoạt động bị hỏng — suy giảm ở bộ render không bao giờ làm đổi trạng thái healthy. Khuyến nghị build lại bộ render hoạt động ở mức release: nó so sánh phiên bản `codex-hud` lúc biên dịch với `package.json`, nên chỉ kích hoạt khi một bản release thay đổi phiên bản, chứ không phải ở mỗi commit.

## Khắc phục sự cố

Bắt đầu bằng `npm run doctor`. Nếu thiếu shim, không tìm thấy Codex gốc, runtime đã patch bị cũ, cấu hình không được áp dụng, hoặc thiếu Rust renderer, hãy sửa mắt xích mà Doctor báo trước rồi chạy lại lệnh cài đặt hoặc build tương ứng.

### Di chuyển từ bản cài codex-hud cũ

Nếu trước đây bạn chạy `npm run patch:codex` (luồng mặc định cũ), hãy chạy `npm run install:launcher` một lần: nó ghi lại `codex-hud-tui` sang chế độ ủy quyền gốc và giữ shim `codex` hiện có hoạt động bình thường. Lệnh cũ `codex-hud-codex` còn hoạt động tốt sẽ được giữ nguyên (kèm ghi chú về độ cũ); lệnh hỏng bị cách ly thành `codex-hud-codex.broken-<timestamp>` để thất bại nhanh thay vì chết giữa chừng khi khởi chạy. Lần `npm run patch:codex` kế tiếp sẽ tự động di chuyển payload phẳng cũ sang bố cục theo phiên bản. Chạy `npm run doctor` để xem mọi thứ còn sót lại.

## Thử nghiệm: Footer Codex đã vá

> **Cảnh báo — tính năng thử nghiệm.** Chế độ này build một nhị phân Codex vá cục bộ, không có chữ ký. macOS có thể diệt các bản build lại không chữ ký (trình cài đặt kiểm tra sức khỏe từng payload *trước khi* kích hoạt, nên build hỏng không bao giờ phá được `codex` đang hoạt động của bạn), và nhị phân vá **sẽ lỗi thời khi Codex gốc cập nhật** — bạn phải chạy lại `npm run patch:codex` sau mỗi lần Codex cập nhật. Hãy ưu tiên launcher ủy quyền mặc định trừ khi bạn thật sự cần footer trong TUI.

Codex gốc không thể hiển thị đầu ra plugin tùy ý bên dưới vùng nhập. Để có footer kiểu Claude HUD, hãy build một lệnh Codex vá riêng:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

Patched mode also passes live session state to the HUD renderer through four stable environment variables: `CODEX_HUD_MODEL`, `CODEX_HUD_EFFORT`, `CODEX_HUD_SERVICE_TIER`, and `CODEX_HUD_ROLLOUT_PATH`. Each patched session therefore keeps its own identity, context, and token totals. A fresh session may briefly have no effort value or rollout path; until Codex finishes opening the rollout, the HUD shows `Ctx:?` and `Tkn:?` as unknown placeholders instead of borrowing another session's values. Live `/model`, reasoning, and `/fast` changes are reflected immediately, but Codex's `/model` flow can persist the model and effort to global `~/.codex/config.toml`. For a session-only identity, launch with `codex -m <model> -c 'model_reasoning_effort="<effort>"'`. The `5h` and `7d` segments remain account-wide, so movement in both HUDs is expected and is not session bleed. The installer and `npm run doctor` also verify that the deployed `~/.local/bin/codex-hud` actually consumes these variables: a renderer built before this contract fails the patched-mode install health check (with a `npm run build:rust` hint) instead of silently falling back to `config.toml` identity and another session's usage.

Chế độ launcher an toàn không đụng tới lệnh `codex` thông thường của bạn:

```bash
codex-hud-tui
```

Để lần khởi chạy `codex` mới dùng TUI có HUD, hãy chủ động bật shim được quản lý:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` phải trỏ tới `~/.local/bin/codex`. Trình cài đặt từ chối thay thế `~/.local/bin/codex` hiện có trừ khi bạn truyền `--force-shim`, và cũng từ chối cài chính nhị phân vá làm `codex` trừ khi bạn truyền `--replace-codex`.

Hoàn tác chỉ gỡ shim `codex` được quản lý:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Nếu thích cấu hình bền vững, thêm dòng được in ra vào dưới bảng `[tui]` hiện có; lưu ý các phiên bản Codex gốc có thể từ chối trường không xác định. Tạo dòng chính xác cho máy của bạn từ thư mục gốc repo (`node scripts/install-patched-codex.js --print-config` phân giải bộ render theo đúng cách trình cài đặt thực hiện):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

Rồi dán vào dưới `[tui]` trong `~/.codex/config.toml`:

```toml
# Thay /Users/you bằng thư mục home của bạn.
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

Chạy `codex-hud-tui` để xem footer gọn. Nhị phân vá không bám theo cập nhật của Codex gốc: nếu Codex gốc thay đổi sau khi build, launcher vá sẽ in cảnh báo một dòng lúc khởi chạy (và vẫn chạy nhị phân vá bạn đã chọn) — build lại bằng `npm run patch:codex` hoặc quay về ủy quyền bằng `npm run install:launcher`. Mỗi lần build lại đều qua khu vực chờ, kiểm tra sức khỏe rồi kích hoạt nguyên tử; phiên bản hoạt động trước đó nằm trong `~/.local/bin/codex-hud-codex.d/` để hoàn tác, và `npm run doctor` báo cáo độ cũ cùng payload hỏng. Khi shim `codex` được quản lý đang bật, trình cài đặt bỏ qua shim đó lúc dò phiên bản Codex cơ sở và dùng `codex` thật kế tiếp trên `PATH`; truyền `--version <version>` nếu cần cố định rõ mục tiêu build lại.
## Bố cục dự án

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # mã nguồn codex-hud (bộ render status-line mặc định)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## Lộ trình

- Thêm các bản tóm tắt transcript phiên phong phú hơn nếu Codex cung cấp một API trạng thái phiên cục bộ ổn định cho plugin.
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- Theo dõi issue thượng nguồn OpenAI Codex [#17827](https://github.com/openai/codex/issues/17827). Tính đến 2026-06-10, Codex gốc vẫn có các mục `[tui].status_line` tích hợp nhưng chưa có bộ render dựa trên lệnh hoặc do plugin sở hữu; chỉ loại bỏ bản vá khi một bộ render tùy chỉnh được hỗ trợ được phát hành.
- Phát hành các nhị phân release `codex-hud` đã build sẵn kèm checksum SHA-256 để trình cài đặt một dòng có thể bỏ qua bước build Rust cục bộ.

## Đóng góp

Hoan nghênh các issue và pull request. Xem [CONTRIBUTING.md](CONTRIBUTING.md) để biết quy trình đóng góp và tài liệu tham khảo đầy đủ về các script bảo trì.

## Giấy phép

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
