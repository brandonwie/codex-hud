**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Türkçe | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**OpenAI Codex CLI için bir çalışma alanı HUD'u — bağımsız komutlar çok satırlı workspace görünümü üretebilir; deneysel yamalı Codex TUI altbilgisi şu anda yalnızca kompakt tek satırlı durum satırını gösterir.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Built with Rust](https://img.shields.io/badge/Built_with-Rust-dea584?style=for-the-badge&logo=rust&logoColor=white)](rust/Cargo.toml)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#yapılandırma)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#hızlı-başlangıç)

[Özellikler](#özellikler) · [Hızlı Başlangıç](#hızlı-başlangıç) · [Yapılandırma](#yapılandırma) · [Yamalı Codex Alt Bilgisi](#deneysel-yamalı-codex-alt-bilgisi) · [Yol Haritası](#yol-haritası)

</div>

---

Codex HUD iki yüzeyi olan yerel bir Codex eklentisidir: bağımsız komutlar çok satırlı workspace görünümü yazdırabilir, deneysel yamalı Codex TUI ise kompakt `--line` çıktısını tek satırlı altbilgi olarak render eder.

Varsayılan olarak, Codex'in yerel `[tui].status_line` özelliğine eşlik eder; çünkü standart Codex, giriş alanının altında rastgele eklenti çıktısı gösteremez — yapılandırılabilir bir yerleşik durum öğesi dizisi sunar ancak eklentinin sahip olduğu bir oluşturucu sunmaz. Bu depo ayrıca, kompakt durum satırını doğrudan gerçek Codex altbilgisinde oluşturmak isteyen kullanıcılar için bakımı yapılan bir yama yolu da sunar.

`--line` ile yazdırılan kompakt durum satırı (yalnızca yamalı modda TUI içi altbilgi olarak oluşturulur):

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,🐢100%)|7d:16%(5.1d,👾27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Bu satırdaki segmentler, etiketler, renkler ve eşiklerin tümü yapılandırılabilir — bkz. [Yapılandırma](#yapılandırma).

Varsayılan durum satırı oluşturucusu `codex-hud`'dur: küçük, yerel (native) bir Rust ikilisidir (edition 2021, MIT) — render yolunda yorumlayıcı bulunmayan, tek parça ve kendi kendine yeten bir çalıştırılabilir dosya; minimal bir bağımlılık ayak izi (yalnızca `serde_json` ve `toml`), sıfır `unsafe` kod ve yaklaşık 574 KB civarında gelen, boyut için optimize edilmiş bir release derlemesi. Netlik için: bu README'de iki farklı "Rust" geçer — yukarı akıştaki Codex CLI'nin kendisi bir Rust programıdır (aşağıdaki deneysel yamanın derleme hedefi), `codex-hud` ise depo içindeki ayrı durum satırı oluşturucusudur.

## Özellikler

- Codex sürümü, model, akıl yürütme eforu, kum havuzu (sandbox) ve onay modu
- Yerel Codex durum satırı öğe sayısı ve renk ayarı
- Codex rollout günlüklerinden ayrıştırılan kompakt kullanım — yukarıdaki kompakt satır (yamalı modda TUI içi altbilgi)
- Geçerli çalışma dizini, git dalı, kirli sayımlar ve depo kökü
- Paket adı, yakındaki `AGENTS.md` ve mevcut olduğunda 3B `ACTIVE-STATUS.md` önceliği gibi proje ipuçları
- `hooks.json` dosyasından Codex hook olay sayıları
- Canlı token ve hız limiti değerleri için Codex'in yerel durum satırının yetkili kaynak olmaya devam ettiğine dair net bir not

## Hızlı Başlangıç

Depoyu klonlayın, ardından bunu yerel bir Codex eklentisi olarak kurun:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Bu depoyu yerel bir eklenti pazarı olarak kaydedin, ardından eklentiyi ekleyin:
codex plugin marketplace add "$(pwd)"
codex plugin add brandonwie@codex-hud
```

Ardından HUD başlatıcısını kurun (önerilir). Varsayılan mod **gerçek Codex kurulumunuza delege eder**; böylece Homebrew/npm üzerinden gelen Codex güncellemeleri otomatik olarak devreye girer — yeniden derleme yok, yamalı ikili dosya yok. Açık olmak gerekirse: stok delegasyon başlatıcısı TUI içi bir altbilgi **oluşturmaz** — güvenli delegasyon ile yönetilen `codex` şimini sağlar; TUI içi altbilgi yalnızca aşağıdaki deneysel yamalı modda vardır:

```bash
npm run install:launcher                    # ~/.local/bin/codex-hud-tui kurulur
npm run install:launcher -- --make-default  # isteğe bağlı: `codex` başlatıcıya çözümlensin
rehash
```

İsteğe bağlı olarak Rust durum satırı oluşturucusunu derleyin. Bu, stok olarak başlatılan bir TUI'de görünür hiçbir şeyi değiştirmez — deneysel yamalı altbilgi ve bağımsız `codex-hud` kullanımı (`--watch` ya da `status_line_command`'ı başka araçlara elle bağlama) için önemlidir. Bir kez derlendiğinde kurulum aracı, yamalı mod ve `--print-config` için onu otomatik olarak algılar (`--renderer auto`):

```bash
npm run build:rust   # isteğe bağlı: rust/target/release/codex-hud derlenir
```

Ayrıntılar için aşağıdaki "HUD Başlatıcısı" bölümüne, tanılama için `npm run doctor` komutuna bakın.

Beceri listesinin yenilenmesi için kurulumdan veya yeniden kurulumdan sonra yeni bir Codex iş parçacığı başlatın.

> **İpucu:** `codex plugin marketplace add "$(pwd)"` geçerli dizini okur, bu yüzden onu depo kökünden çalıştırın. `"$(pwd)"` yerine açık bir yol da geçirebilirsiniz.

## Kullanım

Run the Rust renderer directly during development:

```bash
npm run build:rust
./rust/target/release/codex-hud           # bağımsız çok satırlı görünüm
./rust/target/release/codex-hud --line     # tek kompakt satır
./rust/target/release/codex-hud --line --color
./rust/target/release/codex-hud --json      # makine tarafından okunabilir
./rust/target/release/codex-hud --watch 5   # her 5 saniyede bir yenile
npm test
```

Kompakt durum satırının (`--line`) terminal yakalaması:

```text
$ ./rust/target/release/codex-hud --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,🐢21%)|7d:20%(4.9d,👾30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

The default status-line renderer is `codex-hud`, this repo's small Rust binary. Two different "Rust"s appear in this README: the upstream Codex CLI is itself a Rust program (the build target of the experimental patch below), while `codex-hud` is the in-repo status-line renderer.

`codex-hud` (`npm run build:rust` sonrasında) birebir aynı bayrak yüzeyini sunar — `--line` / `--status-line` / `--color` / `--json` / `--watch` / `--init-config` / `--print-config` / `--config-path`:

```bash
./rust/target/release/codex-hud --line --color
```

## Yapılandırma

Both the standalone workspace snapshot and the compact status line are configurable through an optional `codex-hud.toml`. With no config file you get the defaults shown above; every key is optional and anything you omit inherits the built-in default.

```bash
codex-hud --init-config     # ~/.codex/codex-hud.toml dosyasını oluştur (üzerine yazmak için --force)
codex-hud --print-config    # çözümlenmiş, birleştirilmiş yapılandırmayı JSON olarak yazdır
codex-hud --config-path     # hangi yapılandırma dosyalarının geçerli olduğunu göster
```

### Arama sırası

Sonraki kaynaklar öncekileri geçersiz kılar (anahtar başına — diziler değiştirilir, skalerler geçersiz kılınır):

1. yerleşik varsayılanlar
2. `$CODEX_HOME/codex-hud.toml` (kullanıcı başına; `$CODEX_HOME` varsayılan olarak `~/.codex`)
3. `./.codex/codex-hud.toml` (proje başına; git köküne kadar yukarı çıkar)
4. `$CODEX_HUD_CONFIG` (ortam değişkeni aracılığıyla açık dosya yolu)

Eksik bir dosya sorun değildir. Bozuk veya geçersiz bir dosya yok sayılır — HUD varsayılanlara geri döner ve stderr'e tek satırlık bir not yazdırır, böylece durum satırı asla bozulmaz. codex-hud, Codex'in `config.toml` dosyasının içinde bir tablo yerine kendi dosyasını tuttuğu için, bozuk bir HUD yapılandırması Codex'in başlatılmasını asla engelleyemez.

### Seçenekler

```toml
# Varsayılan olarak kompakt. " | " segment aralığı ve ": " etiketleri için true olarak ayarlayın.
space = false

# Segmentler arasına yerleştirilen metin. space bayrağı bu metnin çevresindeki dolguyu kontrol eder.
separator = "|"

# Hangi segmentlerin, hangi sırayla gösterileceği. Id'ler:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Takma adlar: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" mevcuttur ancak varsayılan olarak kapalıdır — etkinleştirmek için ekleyin.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Bir segmentin etiketini yeniden adlandırın (anahtarlar segment id'leridir).
[labels]
ctx = "Ctx"

# Renkler: bir palet adı, bir 256 renk kodu (0-255) veya "#rrggbb" (en yakın
# 256 renge eşlenir). Adlar: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit, ctx / 5h / 7d tarafından paylaşılan eşik renkleridir.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# ctx/5h/7d'yi ok/warn/crit arasında değiştiren yüzde eşikleri (0-100).
[thresholds.percent]
warn = 70
crit = 90

# Biçimlendirme anahtarları.
[format]
percentRound = true # false -> one decimal place
tokenUnits = true   # false -> raw integers (no k/M)
tokenUsage = true   # false -> yalnızca toplam, (I:.. O:.. C:..) gizle
pace = true     # false -> hide the pace % in 5h/7d
pacePrefix = true   # false -> hız simgesini (🐢/👾/🔥) gizle, %'yi koru
modelShort = true # false -> 5.5 yerine gpt-5.5
effortShort = false # true -> xhigh yerine xh
paceSlowPrefix = "🐢"
paceNormalPrefix = "👾"
paceFastPrefix = "🔥"
```

Pace işaretleri kullanımı eşit tüketim hızıyla karşılaştırır: slow, `thresholds.pace.crit` değerinden fazla geride kalmayı; fast, `thresholds.pace.crit` değerinden fazla önde olmayı; orta bant ise normal durumu gösterir. Tam çözümlenmiş seçenek setini görmek için `codex-hud --print-config` çalıştırın.

## Platform Desteği

Desteklenen launcher akışı macOS ve Linux shell ortamlarını hedefler. Yollar Linux dosya sistemi üzerinden çözümlendiğinde WSL çalışabilir; yönetilen launcher'lar Bash betikleri olduğu için yerel Windows shell'leri desteklenmez.

## HUD Başlatıcısı (Stok Delegasyonu — Varsayılan)

`npm run install:launcher`, `~/.local/bin/codex-hud-tui` dosyasını yazar: gerçek (stok) Codex kurulumunuzu bulup `exec -a codex` ile çalıştıran küçük bir başlatıcı. Böylece Herdr gibi terminal entegrasyonları paneli Codex oturumu olarak tanımaya devam eder. Stok ikili dosyanın yolu kurulum sırasında kaydedilir; yol kaybolursa `PATH` üzerinde Codex'i yeniden keşfeden bir çalışma zamanı yedeği devreye girer (HUD tarafından yönetilen tüm girdiler atlandığından başlatıcı asla kendisini özyinelemeli çalıştıramaz).

Başlatıcı stok Codex'e delege ettiği için:

- Homebrew/npm Codex güncellemeleri otomatik olarak devreye girer — yeniden derleme gerekmez.
- Homebrew/stok Codex dosyalarınız asla değiştirilmez veya başkasıyla değiştirilmez.
- `npm run install:launcher -- --make-default`, yönetilen `~/.local/bin/codex` şimini kurar; kurulum aracı, `--force-shim` geçmedikçe yönetilmeyen bir `codex` dosyasını değiştirmeyi reddeder.

Yalnızca yönetilen şimi kaldırmak için:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor`, başlatma zincirinin tam durumunu yazdırır — şim, başlatıcı modu (stock/patched/legacy), stok Codex yolu ve sürümü, oluşturucu durumu, yamalı yük sürümleri, bayatlık ve artık dosyalar:

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

Yalnızca etkin giriş zinciri bozulduğunda sıfırdan farklı bir kodla çıkar — oluşturucu tarafındaki bir bozulma, sağlıklı (healthy) durumu asla değiştirmez. Oluşturucu için yeniden derleme önerisi sürüm (release) ayrıntı düzeyinde çalışır: derleme zamanındaki `codex-hud` sürümünü `package.json` ile karşılaştırır; bu yüzden her commit'te değil, yalnızca bir release sürüm numarasını ilerlettiğinde tetiklenir.

## Sorun giderme

Önce `npm run doctor` çalıştırın. Shim eksikse, stok Codex bulunamıyorsa, yamalı runtime eskiyse, yapılandırma uygulanmıyorsa veya Rust renderer yoksa önce Doctor'ın işaret ettiği zincir halkasını düzeltin, ardından ilgili kurulum veya build komutunu yeniden çalıştırın.

### Eski codex-hud kurulumundan geçiş

Daha önce `npm run patch:codex` (eski varsayılan akış) kullandıysanız `npm run install:launcher` komutunu bir kez çalıştırın: `codex-hud-tui` stok delegasyonuna yeniden yazılır ve mevcut `codex` şiminiz çalışmaya devam eder. Sağlıklı eski `codex-hud-codex` komutu yerinde bırakılır (bayatlama notuyla birlikte); bozuk olanı `codex-hud-codex.broken-<timestamp>` olarak karantinaya alınır, böylece başlatma ortasında ölmek yerine hızla başarısız olur. Bir sonraki `npm run patch:codex`, eski düz yükü sürümlü düzene otomatik taşır. Kalan her şeyi `npm run doctor` gösterir.

## Deneysel: Yamalı Codex Alt Bilgisi

> **Uyarı — deneysel.** Bu mod, yerel olarak yamalanmış, imzasız bir Codex ikili dosyası derler. macOS imzasız yeniden derlemeleri sonlandırabilir (kurulum aracı her yükü etkinleştirmeden *önce* sağlık denetiminden geçirir; bu yüzden başarısız bir derleme etkin `codex` komutunuzu asla bozamaz) ve yamalı ikili dosya **stok Codex güncellendiğinde bayatlar** — Codex güncellemelerinden sonra `npm run patch:codex` komutunu yeniden çalıştırmanız gerekir. TUI içi alt bilgiye özellikle ihtiyacınız yoksa varsayılan stok delegasyon başlatıcısını tercih edin.

Stok Codex, giriş alanının altında rastgele eklenti çıktısı gösteremez. Claude HUD tarzı bir alt bilgi için ayrı bir yamalı Codex komutu derleyin:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and stages the executable under `~/.local/bin/codex-hud-codex.d/<version>/codex`. The staged payload must pass a `--version` health check **before** anything is activated; only then is `~/.local/bin/codex-hud-codex` atomically retargeted to the new payload, and the previous version is kept on disk for rollback. A failed build is kept aside as `<version>.failed` and the active runtime is left untouched. It also writes `~/.local/bin/codex-hud-tui` in patched mode, a launcher that passes the colored status-line command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. With the default `--renderer auto`, the injected command is `'~/.local/bin/codex-hud' --line --color`; if that Rust renderer is missing or fails its health check, the patched install stops instead of falling back to another renderer. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

Güvenli başlatıcı modu normal `codex` komutunuza dokunmaz:

```bash
codex-hud-tui
```

Yeni bir `codex` başlatmasının HUD'lu TUI'yi kullanması için yönetilen şime açıkça katılın:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex`, `~/.local/bin/codex` yoluna çözümlenmelidir. Kurulum aracı `--force-shim` geçmedikçe mevcut `~/.local/bin/codex` dosyasını değiştirmeyi, `--replace-codex` geçmedikçe de yamalı ikiliyi doğrudan `codex` olarak kurmayı reddeder.

Geri alma yalnızca yönetilen `codex` şimini kaldırır:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Kalıcı yapılandırma tercih ediyorsanız yazdırılan satırı mevcut `[tui]` tablonuzun altına ekleyin; ancak stok Codex sürümlerinin bilinmeyen alanları reddedebileceğini unutmayın. Makinenize özel satırı depo kökünden üretin (`node scripts/install-patched-codex.js --print-config`, oluşturucuyu kurulum aracıyla aynı şekilde çözümler):

```bash
echo "status_line_command = \"$HOME/.local/bin/codex-hud --line --color\""
```

Sonra `~/.codex/config.toml` içindeki `[tui]` altına yapıştırın:

```toml
# /Users/you kısmını ev dizininizle değiştirin.
status_line_command = "/Users/you/.local/bin/codex-hud --line --color"
```

Kompakt alt bilgiyi görmek için `codex-hud-tui` çalıştırın. Yamalı ikili dosya stok Codex güncellemelerini izlemez: derlemeden sonra stok Codex değişirse, yamalı başlatıcı açılışta tek satırlık bir uyarı yazdırır (yine de seçtiğiniz yamalı ikiliyi çalıştırır) — `npm run patch:codex` ile yeniden derleyin veya `npm run install:launcher` ile stok delegasyonuna geri dönün. Her yeniden derleme hazırlanır, sağlık denetiminden geçer ve atomik olarak etkinleştirilir; önceki çalışan sürüm geri alma için `~/.local/bin/codex-hud-codex.d/` altında kalır ve `npm run doctor` bayatlık ile bozuk yükleri bildirir. Yönetilen `codex` şimi etkinken kurulum aracı, temel Codex sürümünü algılarken bu şimi atlar ve `PATH` üzerindeki bir sonraki gerçek `codex` dosyasını kullanır; yeniden derleme hedefini açıkça sabitlemeniz gerekirse `--version <version>` geçin.
## Proje Düzeni

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     └─ skills/codex-hud/SKILL.md
├─ rust/                             # codex-hud kaynağı (varsayılan durum satırı oluşturucusu)
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ test-rust-golden.js
   ├─ test-rust-parsing-golden.js
   ├─ test-rust-cli.js
   └─ install-patched-codex.js
```

## Yol Haritası

- Codex, eklentiler için kararlı bir yerel oturum durumu API'si sunarsa daha zengin oturum dökümü özetleri eklemek.
- Keep `codex-hud` covered by the golden fixtures (`npm run test:rust` verifies the Rust renderer against them).
- Yukarı akış OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827) takip edilsin. 2026-06-10 itibarıyla stok Codex yerleşik `[tui].status_line` öğelerine sahip, ancak komut destekli veya eklentiye ait bir oluşturucu yok; yamayı yalnızca desteklenen özel bir oluşturucu yayınlandığında emekliye ayırın.

## Katkıda Bulunma

Sorunlar (issue) ve çekme istekleri (pull request) memnuniyetle karşılanır. HUD çıktısını değiştirdikten sonra `npm test` ve Codex eklenti doğrulayıcısını çalıştırın. Manifest sürümünü değiştirdikten veya release aldıktan sonra manuel test için yerel eklenti önbelleğini `codex plugin add brandonwie@codex-hud` ile yenileyin, ardından güncellenmiş skill metadatasının yüklenmesi için yeni bir Codex thread başlatın.

### Bakımcı betikleri

Yaygın bakım komutları: `npm test`, `npm run test:rust`, `npm run check:i18n`, `npm run doctor`, `npm run sync:version`, `npm run measure:rust` (release ikilisi boyutunu (~574 KB) bildirir ve Rust oluşturucusunun gecikmesini eski Node oluşturucusuyla karşılaştırır).

## Lisans

[MIT](LICENSE) © Brandon Wie

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=brandonwie/codex-hud&type=Date)](https://star-history.com/#brandonwie/codex-hud&Date)
