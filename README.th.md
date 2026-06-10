**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | ไทย | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**HUD พื้นที่ทำงานแบบกะทัดรัดและมีสีสันสำหรับ OpenAI Codex CLI — โมเดล, โปรเจกต์, git, คอนเท็กซ์ และการใช้งานรอบ 5h/7d ในบรรทัด footer เดียว**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#การตั้งค่า)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#เริ่มต้นใช้งานอย่างรวดเร็ว)

[คุณสมบัติ](#คุณสมบัติ) · [เริ่มต้นใช้งานอย่างรวดเร็ว](#เริ่มต้นใช้งานอย่างรวดเร็ว) · [การตั้งค่า](#การตั้งค่า) · [Footer ของ Codex ที่แพตช์แล้ว](#footer-ของ-codex-ที่แพตช์แล้ว) · [โรดแมป](#โรดแมป)

</div>

---

Codex HUD เป็นปลั๊กอิน Codex แบบโลคัลที่เรนเดอร์ HUD พื้นที่ทำงานแบบหลายบรรทัดสำหรับเซสชัน OpenAI Codex CLI

โดยค่าเริ่มต้น มันทำหน้าที่เป็นส่วนเสริมของ `[tui].status_line` แบบเนทีฟของ Codex เพราะ Codex รุ่นมาตรฐานเปิดให้ปรับแต่งอาร์เรย์ของรายการสถานะที่ติดตั้งมาในตัวได้ แต่ไม่มีตัวเรนเดอร์ที่ปลั๊กอินเป็นเจ้าของ รีโปนี้ยังมาพร้อมเส้นทางการแพตช์ที่ดูแลรักษาไว้สำหรับผู้ใช้ที่ต้องการให้สคริปต์ HUD เรนเดอร์ลงใน footer จริงของ Codex โดยตรง

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> เซกเมนต์ ป้ายกำกับ สี และเกณฑ์ต่าง ๆ ในบรรทัดนั้นปรับแต่งได้ทั้งหมด — ดู [การตั้งค่า](#การตั้งค่า)

## คุณสมบัติ

- เวอร์ชัน Codex, โมเดล, ระดับการให้เหตุผล (reasoning effort), แซนด์บ็อกซ์ และโหมดการอนุมัติ
- จำนวนและการตั้งค่าสีของรายการ status-line แบบเนทีฟของ Codex
- การใช้งานแบบกะทัดรัดที่แยกวิเคราะห์จาก rollout logs ของ Codex (footer ตัวอย่างด้านบน)
- ไดเรกทอรีทำงานปัจจุบัน, สาขา git, จำนวนการเปลี่ยนแปลงที่ยังไม่คอมมิต และรากของรีโป
- คำใบ้ของโปรเจกต์ เช่น ชื่อแพ็กเกจ, `AGENTS.md` ที่อยู่ใกล้เคียง และลำดับความสำคัญจาก `ACTIVE-STATUS.md` ของ 3B เมื่อมี
- จำนวนเหตุการณ์ของ Codex hook จาก `hooks.json`
- หมายเหตุที่ชัดเจนว่า status line แบบเนทีฟของ Codex ยังคงเป็นแหล่งอ้างอิงที่เชื่อถือได้สำหรับค่าโทเค็นและขีดจำกัดอัตรา (rate-limit) แบบเรียลไทม์

## เริ่มต้นใช้งานอย่างรวดเร็ว

โคลนรีโป จากนั้นติดตั้งเป็นปลั๊กอิน Codex แบบโลคัล:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# ลงทะเบียนรีโปนี้เป็นมาร์เก็ตเพลสปลั๊กอินแบบโลคัล จากนั้นเพิ่มปลั๊กอิน:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

จากนั้นติดตั้งตัวเรียกใช้ HUD (แนะนำ) โหมดเริ่มต้นจะ**ส่งต่อไปยัง Codex ตัวจริงที่คุณติดตั้งไว้** ดังนั้นการอัปเดต Codex ผ่าน Homebrew/npm จะถูกนำมาใช้โดยอัตโนมัติ — ไม่ต้องคอมไพล์ใหม่ ไม่มีไบนารีที่ถูกแพตช์:

```bash
npm run install:launcher                    # ติดตั้ง ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # ตัวเลือก: ให้ `codex` ชี้ไปที่ตัวเรียกใช้
rehash
```

ดูรายละเอียดที่หัวข้อ "ตัวเรียกใช้ HUD" ด้านล่าง และใช้ `npm run doctor` สำหรับการวินิจฉัย

เริ่มเธรด Codex ใหม่หลังจากติดตั้งหรือติดตั้งใหม่ เพื่อให้รายการสกิลได้รับการรีเฟรช

> **เคล็ดลับ:** `codex plugin marketplace add "$(pwd)"` จะอ่านไดเรกทอรีปัจจุบัน ดังนั้นให้รันจากรากของรีโป คุณยังสามารถระบุพาธอย่างชัดเจนแทน `"$(pwd)"` ได้

## การใช้งาน

รันตัวเรนเดอร์โดยตรงระหว่างการพัฒนา:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # HUD หลายบรรทัด
node plugins/codex-hud/scripts/codex-hud.js --line     # บรรทัดกะทัดรัดบรรทัดเดียว
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # อ่านได้ด้วยเครื่อง
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # รีเฟรชทุก 5 วินาที
npm test
```

ภาพจับจากเทอร์มินัลของ footer แบบกะทัดรัดค่าเริ่มต้น:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

รัน `node plugins/codex-hud/scripts/codex-hud.js --line --color` ในเครื่องเพื่อดู footer เดียวกันพร้อมสไตล์สี ANSI

## การตั้งค่า

Footer ปรับแต่งได้ผ่าน `codex-hud.toml` ที่เป็นทางเลือก หากไม่มีไฟล์ตั้งค่า คุณจะได้ footer ค่าเริ่มต้นตามที่แสดงด้านบน ทุกคีย์เป็นทางเลือก และสิ่งใดที่คุณละไว้จะสืบทอดค่าเริ่มต้นที่ติดตั้งมาในตัว

```bash
codex-hud --init-config     # สร้างโครง ~/.codex/codex-hud.toml (--force เพื่อเขียนทับ)
codex-hud --print-config    # พิมพ์ config ที่ถูกแก้ไขรวมแล้วเป็น JSON
codex-hud --config-path     # แสดงว่าไฟล์ตั้งค่าใดที่มีผลใช้งาน
```

### ลำดับการค้นหา

แหล่งที่มาภายหลังจะแทนที่แหล่งก่อนหน้า (ต่อคีย์ — อาร์เรย์แทนที่ทั้งหมด, สเกลาร์เขียนทับ):

1. ค่าเริ่มต้นที่ติดตั้งมาในตัว
2. `$CODEX_HOME/codex-hud.toml` (ต่อผู้ใช้; `$CODEX_HOME` มีค่าเริ่มต้นเป็น `~/.codex`)
3. `./.codex/codex-hud.toml` (ต่อโปรเจกต์; ไล่ขึ้นไปจนถึงรากของ git)
4. `$CODEX_HUD_CONFIG` (พาธไฟล์ที่ระบุอย่างชัดเจนผ่าน env var)

ไฟล์ที่ขาดหายไปไม่เป็นไร ไฟล์ที่รูปแบบผิดหรือไม่ถูกต้องจะถูกละเว้น — HUD จะถอยกลับไปใช้ค่าเริ่มต้นและพิมพ์หมายเหตุหนึ่งบรรทัดบน stderr ดังนั้น status line จะไม่มีวันเสีย codex-hud เก็บไฟล์ของตัวเองแทนที่จะเป็นตารางภายใน `config.toml` ของ Codex ดังนั้น config ของ HUD ที่ไม่ดีจะไม่มีทางหยุดไม่ให้ Codex เริ่มทำงานได้

### ตัวเลือก

```toml
# กะทัดรัดโดยค่าเริ่มต้น ตั้งเป็น true เพื่อเว้นวรรคเซกเมนต์แบบ " | " และป้ายกำกับแบบ ": "
space = false

# ข้อความที่วางระหว่างเซกเมนต์ แฟล็ก space ควบคุมการเว้นช่องรอบข้อความนี้
separator = "|"

# เซกเมนต์ใดที่จะแสดง และเรียงตามลำดับ Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Aliases: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" มีให้ใช้ได้แต่ปิดอยู่โดยค่าเริ่มต้น — เพิ่มเข้าไปเพื่อเปิดใช้งาน)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# เปลี่ยนชื่อป้ายกำกับของเซกเมนต์ (คีย์คือ segment ids)
[labels]
ctx = "Ctx"

# สี: ชื่อจานสี, รหัสสี 256 สี (0-255) หรือ "#rrggbb" (จับคู่กับ
# สี 256 ที่ใกล้เคียงที่สุด) ชื่อ: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit คือสีตามเกณฑ์ที่ใช้ร่วมกันโดย ctx / 5h / 7d
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# เกณฑ์เปอร์เซ็นต์ (0-100) ที่สลับ ctx/5h/7d ระหว่าง ok/warn/crit
[thresholds.percent]
warn = 70
crit = 90

# สวิตช์การจัดรูปแบบ
[format]
tokenParts = true   # false -> แสดงเฉพาะยอดรวม, ซ่อน (I:.. O:.. C:..)
showPace = true     # false -> ซ่อน pace % ใน 5h/7d
```

รัน `codex-hud --print-config` เพื่อดูชุดตัวเลือกที่ถูกแก้ไขรวมแล้วทั้งหมด

## ตัวเรียกใช้ HUD (ส่งต่อไปยัง Codex ดั้งเดิม — ค่าเริ่มต้น)

`npm run install:launcher` จะเขียน `~/.local/bin/codex-hud-tui` ซึ่งเป็นตัวเรียกใช้ขนาดเล็กที่ค้นหา Codex ตัวจริง (ดั้งเดิม) ที่คุณติดตั้งไว้ แล้วรันด้วย `exec -a codex` ทำให้การเชื่อมต่อกับเทอร์มินัลอย่าง Herdr ยังคงจดจำหน้าต่างนั้นเป็นเซสชัน Codex ได้ เส้นทางของไบนารีดั้งเดิมจะถูกบันทึกตอนติดตั้ง พร้อมกลไกสำรองตอนรันที่ค้นหา Codex บน `PATH` อีกครั้งหากเส้นทางหายไป (โดยข้ามรายการทั้งหมดที่ HUD จัดการ ตัวเรียกใช้จึงไม่มีทางเรียกตัวเองซ้ำแบบวนลูป)

เนื่องจากตัวเรียกใช้ส่งต่อไปยัง Codex ดั้งเดิม:

- การอัปเดต Codex ผ่าน Homebrew/npm จะถูกนำมาใช้โดยอัตโนมัติ — ไม่ต้องคอมไพล์ใหม่
- ไฟล์ Codex ดั้งเดิม/Homebrew ของคุณจะไม่ถูกแก้ไขหรือแทนที่เด็ดขาด
- `npm run install:launcher -- --make-default` ติดตั้ง shim ที่ถูกจัดการ `~/.local/bin/codex`; ตัวติดตั้งจะปฏิเสธการแทนที่ `codex` ที่ไม่ได้ถูกจัดการ เว้นแต่คุณจะส่ง `--force-shim`

ลบเฉพาะ shim ที่ถูกจัดการ:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` แสดงสถานะทั้งหมดของห่วงโซ่การเรียกใช้ — shim, โหมดตัวเรียกใช้ (stock/patched/legacy), เส้นทางและเวอร์ชันของ Codex ดั้งเดิม, เวอร์ชันของ payload ที่ถูกแพตช์, ความล้าสมัย และไฟล์ตกค้าง:

```text
prefix: /Users/you/.local/bin
codex shim: managed -> /Users/you/.local/bin/codex-hud-tui (/Users/you/.local/bin/codex)
launcher: v2 mode=stock (/Users/you/.local/bin/codex-hud-tui)
stock codex: /opt/homebrew/bin/codex (0.139.0, realpath /opt/homebrew/Cellar/codex/0.139.0/bin/codex)
patched payload dir: /Users/you/.local/bin/codex-hud-codex.d
patched versions: (none)
patched command: (none)
status: healthy
```

จะออกด้วยรหัสที่ไม่ใช่ศูนย์ก็ต่อเมื่อห่วงโซ่จุดเข้าใช้งานที่ใช้อยู่เสียหายเท่านั้น

### การย้ายจากการติดตั้ง codex-hud รุ่นเก่า

หากก่อนหน้านี้คุณใช้ `npm run patch:codex` (ขั้นตอนเริ่มต้นแบบเก่า) ให้รัน `npm run install:launcher` หนึ่งครั้ง: มันจะเขียน `codex-hud-tui` ใหม่เป็นโหมดส่งต่อไปยัง Codex ดั้งเดิม และ shim `codex` เดิมของคุณยังใช้งานได้ตามปกติ คำสั่ง `codex-hud-codex` รุ่นเก่าที่ยังทำงานได้จะถูกเก็บไว้ (พร้อมหมายเหตุเรื่องความล้าสมัย) ส่วนตัวที่เสียหายจะถูกกักไว้เป็น `codex-hud-codex.broken-<timestamp>` เพื่อให้ล้มเหลวทันทีแทนที่จะตายกลางคันตอนเรียกใช้ การรัน `npm run patch:codex` ครั้งถัดไปจะย้าย payload แบบแบนรุ่นเก่าไปยังโครงสร้างแยกตามเวอร์ชันโดยอัตโนมัติ ใช้ `npm run doctor` เพื่อดูสิ่งที่ตกค้าง

## ฟีเจอร์ทดลอง: แถบท้าย Codex ที่ถูกแพตช์

> **คำเตือน — ฟีเจอร์ทดลอง** โหมดนี้คอมไพล์ไบนารี Codex ที่ถูกแพตช์ในเครื่องและไม่มีลายเซ็น macOS อาจปิดโปรเซสไบนารีที่คอมไพล์ใหม่โดยไม่มีลายเซ็น (ตัวติดตั้งตรวจสุขภาพทุก payload *ก่อน* เปิดใช้งาน ดังนั้นการคอมไพล์ที่ล้มเหลวจะไม่มีทางทำให้ `codex` ที่ใช้อยู่เสียหาย) และไบนารีที่ถูกแพตช์**จะล้าสมัยเมื่อ Codex ดั้งเดิมอัปเดต** — คุณต้องรัน `npm run patch:codex` ใหม่หลังการอัปเดต Codex ทุกครั้ง แนะนำให้ใช้ตัวเรียกใช้แบบส่งต่อที่เป็นค่าเริ่มต้น เว้นแต่คุณต้องการแถบท้ายใน TUI จริง ๆ

Codex ดั้งเดิมไม่สามารถแสดงผลลัพธ์ของปลั๊กอินใต้พื้นที่พิมพ์ได้ หากต้องการแถบท้ายสไตล์ Claude HUD ให้คอมไพล์คำสั่ง Codex ที่ถูกแพตช์แยกต่างหาก:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

ตัวติดตั้งจะแพตช์แท็ก OpenAI Codex ที่ตรงกัน คอมไพล์ Rust CLI แล้วนำไฟล์ปฏิบัติการไปพักไว้ที่ `~/.local/bin/codex-hud-codex.d/<version>/codex` โดย payload ที่พักไว้ต้องผ่านการตรวจสุขภาพ `--version` **ก่อน** การเปิดใช้งานใด ๆ; เมื่อผ่านแล้วเท่านั้น `~/.local/bin/codex-hud-codex` จึงถูกชี้ไปยัง payload ใหม่แบบอะตอมมิก และเวอร์ชันก่อนหน้าถูกเก็บไว้บนดิสก์สำหรับย้อนกลับ การคอมไพล์ที่ล้มเหลวจะถูกแยกเก็บเป็น `<version>.failed` และรันไทม์ที่ใช้อยู่ไม่ถูกแตะต้อง นอกจากนี้ยังเขียน `~/.local/bin/codex-hud-tui` ในโหมดแพตช์ ซึ่งเป็นตัวเรียกใช้ที่ส่งคำสั่ง HUD แบบมีสีผ่านการ override `-c tui.status_line_command=...` ของ Codex โดยไม่แก้ไข `~/.codex/config.toml` ทั้งเส้นทางไฟล์ปฏิบัติการและ `argv[0]` ยังคงใช้ชื่อที่มองเห็นเป็น Codex ทำให้การเชื่อมต่อเทอร์มินัลอย่าง Herdr ยังจดจำหน้าต่างเป็นเซสชัน Codex ได้

โหมดตัวเรียกใช้แบบปลอดภัยไม่แตะต้องคำสั่ง `codex` ปกติของคุณ:

```bash
codex-hud-tui
```

หากต้องการให้การเรียก `codex` ครั้งใหม่ใช้ TUI ที่เปิด HUD ให้เลือกใช้ shim ที่ถูกจัดการอย่างชัดเจน:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` ควรชี้ไปที่ `~/.local/bin/codex` ตัวติดตั้งจะปฏิเสธการแทนที่ `~/.local/bin/codex` ที่มีอยู่ เว้นแต่คุณส่ง `--force-shim` และยังปฏิเสธการติดตั้งไบนารีที่ถูกแพตช์เป็น `codex` โดยตรง เว้นแต่คุณส่ง `--replace-codex`

การย้อนกลับลบเฉพาะ shim `codex` ที่ถูกจัดการ:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

หากต้องการการตั้งค่าแบบถาวร ให้เพิ่มบรรทัดที่พิมพ์ออกมาไว้ใต้ตาราง `[tui]` ที่มีอยู่ แต่โปรดทราบว่า Codex ดั้งเดิมบางเวอร์ชันอาจปฏิเสธฟิลด์ที่ไม่รู้จัก สร้างบรรทัดที่ถูกต้องสำหรับเครื่องของคุณจากรากของ repo:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

จากนั้นวางไว้ใต้ `[tui]` ใน `~/.codex/config.toml`:

```toml
# แทนที่ /path/to/codex-hud ด้วยพาธของโคลนโลคัลของคุณ
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

รัน `codex-hud-tui` เพื่อดูแถบท้ายแบบกะทัดรัด ไบนารีที่ถูกแพตช์จะไม่ตามการอัปเดตของ Codex ดั้งเดิม: หาก Codex ดั้งเดิมเปลี่ยนไปหลังการคอมไพล์ ตัวเรียกใช้แบบแพตช์จะพิมพ์คำเตือนหนึ่งบรรทัดตอนเรียกใช้ (และยังคงรันไบนารีแพตช์ที่คุณเลือกไว้) — คอมไพล์ใหม่ด้วย `npm run patch:codex` หรือกลับไปใช้การส่งต่อด้วย `npm run install:launcher` การคอมไพล์ใหม่ทุกครั้งผ่านการพักไฟล์ ตรวจสุขภาพ และเปิดใช้งานแบบอะตอมมิก; เวอร์ชันที่ใช้งานได้ก่อนหน้ายังอยู่ใต้ `~/.local/bin/codex-hud-codex.d/` สำหรับย้อนกลับ และ `npm run doctor` รายงานความล้าสมัยกับ payload ที่เสียหาย เมื่อ shim `codex` ที่ถูกจัดการเปิดใช้อยู่ ตัวติดตั้งจะข้าม shim นั้นตอนตรวจหาเวอร์ชัน Codex ฐาน แล้วใช้ `codex` ตัวจริงถัดไปบน `PATH`; ส่ง `--version <version>` หากต้องการกำหนดเป้าหมายการคอมไพล์ใหม่อย่างชัดเจน
## โครงสร้างโปรเจกต์

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # ตัวเรนเดอร์ HUD + ตัวโหลด config
│     ├─ vendor/toml.js              # ตัวแยกวิเคราะห์ TOML แบบ vendored (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # สร้าง vendor/toml.js ใหม่
   └─ install-patched-codex.js
```

## โรดแมป

- เพิ่มสรุปบันทึกการสนทนาของเซสชันที่สมบูรณ์ขึ้น หาก Codex เปิดเผย API สถานะเซสชันแบบโลคัลที่เสถียรสำหรับปลั๊กอิน
- ติดตาม issue ต้นทางของ OpenAI Codex [#17827](https://github.com/openai/codex/issues/17827) ณ วันที่ 2026-06-10 Codex แบบเดิมยังมีรายการ `[tui].status_line` ในตัว แต่ยังไม่มีตัวเรนเดอร์แบบใช้คำสั่งหรือเป็นของปลั๊กอิน ให้เลิกใช้แพตช์นี้เฉพาะเมื่อมีตัวเรนเดอร์แบบกำหนดเองที่ได้รับการสนับสนุนเผยแพร่แล้วเท่านั้น

## การร่วมพัฒนา

ยินดีต้อนรับ issue และ pull request หลังจากเปลี่ยนเอาต์พุต HUD ให้รัน `npm test` และตัวตรวจสอบปลั๊กอิน Codex หลังจากเปลี่ยนเวอร์ชัน manifest หรือเผยแพร่ release ให้รีเฟรชแคชปลั๊กอินโลคัลเพื่อทดสอบด้วยมือด้วย `codex plugin add codex-hud@codex-hud` จากนั้นเริ่ม Codex thread ใหม่เพื่อโหลด metadata ของ skill ที่อัปเดตแล้ว

## สัญญาอนุญาต

[MIT](LICENSE) © Brandon Wie
