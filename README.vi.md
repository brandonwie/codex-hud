**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | Tiếng Việt | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**HUD workspace nhỏ gọn, có màu cho OpenAI Codex CLI — model, dự án, git, ngữ cảnh và mức sử dụng 5h/7d gói gọn trong một dòng footer.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#cấu-hình)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#bắt-đầu-nhanh)

[Tính năng](#tính-năng) · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Cấu hình](#cấu-hình) · [Footer Codex đã vá](#footer-codex-đã-vá) · [Lộ trình](#lộ-trình)

</div>

---

Codex HUD là một plugin Codex chạy cục bộ, hiển thị một HUD workspace nhiều dòng cho các phiên OpenAI Codex CLI.

Mặc định nó là một thành phần đồng hành với `[tui].status_line` gốc của Codex, vì Codex bản gốc cung cấp một mảng các mục trạng thái tích hợp có thể cấu hình nhưng không có bộ render do plugin sở hữu. Repo này cũng đi kèm một đường dẫn vá được bảo trì cho những ai muốn script HUD render trực tiếp trong footer Codex thật.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Các segment, nhãn, màu sắc và ngưỡng trong dòng đó đều có thể cấu hình — xem [Cấu hình](#cấu-hình).

## Tính năng

- Phiên bản Codex, model, mức độ suy luận, sandbox và chế độ phê duyệt
- Số lượng mục status-line gốc của Codex và thiết lập màu
- Mức sử dụng nhỏ gọn được phân tích từ log rollout của Codex (footer ví dụ phía trên)
- Thư mục làm việc hiện tại, nhánh git, số lượng thay đổi chưa commit và thư mục gốc của repo
- Các gợi ý về dự án như tên package, `AGENTS.md` lân cận và mức ưu tiên `ACTIVE-STATUS.md` của 3B khi có
- Số lượng sự kiện hook của Codex từ `hooks.json`
- Một ghi chú rõ ràng rằng status line gốc của Codex vẫn là nguồn chính xác cho các giá trị token và giới hạn tốc độ theo thời gian thực

## Bắt đầu nhanh

Clone repo, sau đó cài đặt nó như một plugin Codex cục bộ:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Đăng ký repo này như một marketplace plugin cục bộ, rồi thêm plugin:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

> **⚠️ Update:** the recommended next step is now `npm run install:launcher` (stock-delegating launcher; Codex updates are picked up automatically). See the [English README](./README.md#quick-start) until this translation is updated.

Bắt đầu một thread Codex mới sau khi cài đặt hoặc cài lại để danh sách skill được làm mới.

> **Mẹo:** `codex plugin marketplace add "$(pwd)"` đọc thư mục hiện tại, nên hãy chạy nó từ thư mục gốc của repo. Bạn cũng có thể truyền một đường dẫn cụ thể thay cho `"$(pwd)"`.

## Cách dùng

Chạy trực tiếp bộ render trong quá trình phát triển:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # HUD nhiều dòng
node plugins/codex-hud/scripts/codex-hud.js --line     # một dòng nhỏ gọn
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # định dạng máy đọc được
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # làm mới mỗi 5s
npm test
```

Ảnh chụp terminal của footer nhỏ gọn mặc định:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

Chạy `node plugins/codex-hud/scripts/codex-hud.js --line --color` cục bộ để xem cùng footer với kiểu màu ANSI.

## Cấu hình

Footer có thể cấu hình thông qua một tệp `codex-hud.toml` tùy chọn. Khi không có tệp cấu hình, bạn nhận được footer mặc định hiển thị phía trên; mọi khóa đều là tùy chọn và bất cứ thứ gì bạn bỏ qua sẽ kế thừa giá trị mặc định tích hợp.

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
tokenParts = true   # false -> chỉ tổng, ẩn (I:.. O:.. C:..)
showPace = true     # false -> ẩn % tốc độ trong 5h/7d
```

Chạy `codex-hud --print-config` để xem toàn bộ tập tùy chọn đã được phân giải.

## Footer Codex đã vá

> **⚠️ Outdated section — install/update flow changed.** Stock delegation (`npm run install:launcher`) is now the default and picks up Codex updates automatically; the patched build below is **experimental and opt-in**. See the [English README](./README.md#experimental-patched-codex-footer) for current instructions until this translation is updated.

Codex bản gốc không thể render đầu ra plugin tùy ý dưới vùng nhập liệu. Để có một footer kiểu Claude-HUD, hãy build một lệnh Codex đã vá riêng:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

Trình cài đặt vá tag OpenAI Codex tương ứng, build Rust CLI, và giữ tệp thực thi thật dưới `~/.local/bin/codex-hud-codex.d/codex`, với `~/.local/bin/codex-hud-codex` là một symlink trỏ tới binary đó. Nó cũng ghi `~/.local/bin/codex-hud-tui`, một launcher truyền lệnh HUD có màu qua override `-c tui.status_line_command=...` của Codex mà không thay đổi `~/.codex/config.toml`. Cả đường dẫn tệp thực thi lẫn `argv[0]` đều giữ tên mà Codex nhận diện được, nên các tích hợp terminal như Herdr vẫn có thể nhận ra pane là một phiên Codex.

Chế độ launcher an toàn để nguyên lệnh `codex` thông thường của bạn:

```bash
codex-hud-tui
```

Để một lần khởi chạy `codex` mới dùng TUI đã bật HUD, hãy chọn dùng shim được quản lý:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` sẽ phân giải tới `~/.local/bin/codex`. Trình cài đặt từ chối thay thế một `~/.local/bin/codex` đang tồn tại trừ khi bạn truyền `--force-shim`, và nó vẫn từ chối cài đặt chính binary đã vá dưới tên `codex` trừ khi bạn truyền `--replace-codex`.

Rollback chỉ gỡ bỏ shim `codex` được quản lý:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Nếu bạn thích một cấu hình lâu dài, hãy thêm dòng được in ra dưới bảng `[tui]` đang tồn tại của bạn, nhưng lưu ý rằng các phiên bản Codex bản gốc có thể từ chối các trường không xác định. Tạo dòng chính xác cho máy của bạn từ thư mục gốc của repo:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Sau đó dán nó dưới `[tui]` trong `~/.codex/config.toml`:

```toml
# Thay /path/to/codex-hud bằng đường dẫn clone cục bộ của bạn.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Chạy `codex-hud-tui` để xem footer nhỏ gọn. Các bản cập nhật Homebrew hoặc Codex sẽ không cập nhật lệnh riêng này; hãy chạy lại `npm run patch:codex` sau khi cập nhật Codex. Khi shim `codex` được quản lý đang hoạt động, trình cài đặt bỏ qua shim đó trong lúc dò phiên bản Codex nền và dùng `codex` thật kế tiếp trên `PATH`; truyền `--version <version>` nếu bạn cần ghim mục tiêu rebuild một cách tường minh. Payload được build lại phải vượt qua một kiểm tra sức khỏe `--version` trước khi launcher được ghi lại.

## Bố cục dự án

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # bộ render HUD + bộ tải cấu hình
│     ├─ vendor/toml.js              # bộ phân tích TOML đóng gói sẵn (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # tạo lại vendor/toml.js
   └─ install-patched-codex.js
```

## Lộ trình

- Thêm các bản tóm tắt transcript phiên phong phú hơn nếu Codex cung cấp một API trạng thái phiên cục bộ ổn định cho plugin.
- Theo dõi issue thượng nguồn OpenAI Codex [#17827](https://github.com/openai/codex/issues/17827). Tính đến 2026-06-10, Codex gốc vẫn có các mục `[tui].status_line` tích hợp nhưng chưa có bộ render dựa trên lệnh hoặc do plugin sở hữu; chỉ loại bỏ bản vá khi một bộ render tùy chỉnh được hỗ trợ được phát hành.

## Đóng góp

Hoan nghênh các issue và pull request. Sau khi thay đổi đầu ra HUD, hãy chạy `npm test` và trình kiểm tra plugin Codex. Sau khi thay đổi phiên bản manifest hoặc phát hành release, hãy làm mới cache plugin cục bộ để kiểm thử thủ công bằng `codex plugin add codex-hud@codex-hud`, rồi mở một thread Codex mới để tải metadata skill đã cập nhật.

## Giấy phép

[MIT](LICENSE) © Brandon Wie
