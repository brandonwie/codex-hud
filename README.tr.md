**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Türkçe | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**OpenAI Codex CLI için kompakt, renkli bir çalışma alanı HUD'u — model, proje, git, bağlam ve 5s/7g kullanımı tek bir altbilgi satırında.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#yapılandırma)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#hızlı-başlangıç)

[Özellikler](#özellikler) · [Hızlı Başlangıç](#hızlı-başlangıç) · [Yapılandırma](#yapılandırma) · [Yamalı Codex Altbilgisi](#yamalı-codex-altbilgisi) · [Yol Haritası](#yol-haritası)

</div>

---

Codex HUD, OpenAI Codex CLI oturumları için çok satırlı bir çalışma alanı HUD'u oluşturan yerel bir Codex eklentisidir.

Varsayılan olarak, Codex'in yerel `[tui].status_line` özelliğine eşlik eder; çünkü standart Codex, yapılandırılabilir bir yerleşik durum öğesi dizisi sunar ancak eklentinin sahip olduğu bir oluşturucu sunmaz. Bu depo ayrıca, HUD betiğinin doğrudan gerçek Codex altbilgisinde oluşturulmasını isteyen kullanıcılar için bakımı yapılan bir yama yolu da sunar.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Bu satırdaki segmentler, etiketler, renkler ve eşiklerin tümü yapılandırılabilir — bkz. [Yapılandırma](#yapılandırma).

## Özellikler

- Codex sürümü, model, akıl yürütme eforu, kum havuzu (sandbox) ve onay modu
- Yerel Codex durum satırı öğe sayısı ve renk ayarı
- Codex rollout günlüklerinden ayrıştırılan kompakt kullanım (yukarıdaki örnek altbilgi)
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
codex plugin add codex-hud@codex-hud
```

Ardından HUD başlatıcısını kurun (önerilir). Varsayılan mod **gerçek Codex kurulumunuza delege eder**; böylece Homebrew/npm üzerinden gelen Codex güncellemeleri otomatik olarak devreye girer — yeniden derleme yok, yamalı ikili dosya yok:

```bash
npm run install:launcher                    # ~/.local/bin/codex-hud-tui kurulur
npm run install:launcher -- --make-default  # isteğe bağlı: `codex` başlatıcıya çözümlensin
rehash
```

Ayrıntılar için aşağıdaki "HUD Başlatıcısı" bölümüne, tanılama için `npm run doctor` komutuna bakın.

Beceri listesinin yenilenmesi için kurulumdan veya yeniden kurulumdan sonra yeni bir Codex iş parçacığı başlatın.

> **İpucu:** `codex plugin marketplace add "$(pwd)"` geçerli dizini okur, bu yüzden onu depo kökünden çalıştırın. `"$(pwd)"` yerine açık bir yol da geçirebilirsiniz.

## Kullanım

Geliştirme sırasında oluşturucuyu doğrudan çalıştırın:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # çok satırlı HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # tek kompakt satır
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # makine tarafından okunabilir
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # her 5 saniyede bir yenile
npm test
```

Varsayilan kompakt altbilginin terminal yakalamasi:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

Ayni altbilgiyi ANSI renk stilleriyle gormek icin yerelde `node plugins/codex-hud/scripts/codex-hud.js --line --color` calistirin.

## Yapılandırma

Altbilgi, isteğe bağlı bir `codex-hud.toml` dosyası aracılığıyla yapılandırılabilir. Yapılandırma dosyası olmadığında yukarıda gösterilen varsayılan altbilgiyi alırsınız; her anahtar isteğe bağlıdır ve atladığınız her şey yerleşik varsayılanı devralır.

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
tokenParts = true   # false -> yalnızca toplam, (I:.. O:.. C:..) gizle
showPace = true     # false -> 5h/7d'deki tempo %'sini gizle
```

Tam çözümlenmiş seçenek setini görmek için `codex-hud --print-config` çalıştırın.

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

`npm run doctor`, başlatma zincirinin tam durumunu yazdırır — şim, başlatıcı modu (stock/patched/legacy), stok Codex yolu ve sürümü, yamalı yük sürümleri, bayatlık ve artık dosyalar:

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

Yalnızca etkin giriş zinciri bozulduğunda sıfırdan farklı bir kodla çıkar.

### Eski codex-hud kurulumundan geçiş

Daha önce `npm run patch:codex` (eski varsayılan akış) kullandıysanız `npm run install:launcher` komutunu bir kez çalıştırın: `codex-hud-tui` stok delegasyonuna yeniden yazılır ve mevcut `codex` şiminiz çalışmaya devam eder. Sağlıklı eski `codex-hud-codex` komutu yerinde bırakılır (bayatlama notuyla birlikte); bozuk olanı `codex-hud-codex.broken-<timestamp>` olarak karantinaya alınır, böylece başlatma ortasında ölmek yerine hızla başarısız olur. Bir sonraki `npm run patch:codex`, eski düz yükü sürümlü düzene otomatik taşır. Kalan her şeyi `npm run doctor` gösterir.

## Deneysel: Yamalı Codex Alt Bilgisi

> **Uyarı — deneysel.** Bu mod, yerel olarak yamalanmış, imzasız bir Codex ikili dosyası derler. macOS imzasız yeniden derlemeleri sonlandırabilir (kurulum aracı her yükü etkinleştirmeden *önce* sağlık denetiminden geçirir; bu yüzden başarısız bir derleme etkin `codex` komutunuzu asla bozamaz) ve yamalı ikili dosya **stok Codex güncellendiğinde bayatlar** — Codex güncellemelerinden sonra `npm run patch:codex` komutunu yeniden çalıştırmanız gerekir. TUI içi alt bilgiye özellikle ihtiyacınız yoksa varsayılan stok delegasyon başlatıcısını tercih edin.

Stok Codex, giriş alanının altında rastgele eklenti çıktısı gösteremez. Claude HUD tarzı bir alt bilgi için ayrı bir yamalı Codex komutu derleyin:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

Kurulum aracı eşleşen OpenAI Codex etiketini yamalar, Rust CLI'yi derler ve yürütülebilir dosyayı `~/.local/bin/codex-hud-codex.d/<version>/codex` altında hazırlar. Hazırlanan yük, herhangi bir etkinleştirmeden **önce** `--version` sağlık denetimini geçmek zorundadır; ancak o zaman `~/.local/bin/codex-hud-codex` atomik olarak yeni yüke yönlendirilir ve önceki sürüm geri alma için diskte tutulur. Başarısız bir derleme `<version>.failed` olarak kenara konur ve etkin çalışma zamanı dokunulmadan kalır. Ayrıca yamalı modda `~/.local/bin/codex-hud-tui` yazılır: renkli HUD komutunu `~/.codex/config.toml` dosyasını değiştirmeden Codex'in `-c tui.status_line_command=...` geçersiz kılmasıyla ileten bir başlatıcı. Yürütülebilir dosya yolu ve `argv[0]` Codex olarak görünen adları korur; böylece Herdr gibi terminal entegrasyonları paneli Codex oturumu olarak tanımaya devam eder.

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

Kalıcı yapılandırma tercih ediyorsanız yazdırılan satırı mevcut `[tui]` tablonuzun altına ekleyin; ancak stok Codex sürümlerinin bilinmeyen alanları reddedebileceğini unutmayın. Makinenize özel satırı depo kökünden üretin:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Sonra `~/.codex/config.toml` içindeki `[tui]` altına yapıştırın:

```toml
# Replace /path/to/codex-hud with your local clone path.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Kompakt alt bilgiyi görmek için `codex-hud-tui` çalıştırın. Yamalı ikili dosya stok Codex güncellemelerini izlemez: derlemeden sonra stok Codex değişirse, yamalı başlatıcı açılışta tek satırlık bir uyarı yazdırır (yine de seçtiğiniz yamalı ikiliyi çalıştırır) — `npm run patch:codex` ile yeniden derleyin veya `npm run install:launcher` ile stok delegasyonuna geri dönün. Her yeniden derleme hazırlanır, sağlık denetiminden geçer ve atomik olarak etkinleştirilir; önceki çalışan sürüm geri alma için `~/.local/bin/codex-hud-codex.d/` altında kalır ve `npm run doctor` bayatlık ile bozuk yükleri bildirir. Yönetilen `codex` şimi etkinken kurulum aracı, temel Codex sürümünü algılarken bu şimi atlar ve `PATH` üzerindeki bir sonraki gerçek `codex` dosyasını kullanır; yeniden derleme hedefini açıkça sabitlemeniz gerekirse `--version <version>` geçin.
## Proje Düzeni

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD oluşturucu + yapılandırma yükleyici
│     ├─ vendor/toml.js              # gömülü TOML ayrıştırıcı (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # vendor/toml.js dosyasını yeniden oluşturur
   └─ install-patched-codex.js
```

## Yol Haritası

- Codex, eklentiler için kararlı bir yerel oturum durumu API'si sunarsa daha zengin oturum dökümü özetleri eklemek.
- Yukarı akış OpenAI Codex issue [#17827](https://github.com/openai/codex/issues/17827) takip edilsin. 2026-06-10 itibarıyla stok Codex yerleşik `[tui].status_line` öğelerine sahip, ancak komut destekli veya eklentiye ait bir oluşturucu yok; yamayı yalnızca desteklenen özel bir oluşturucu yayınlandığında emekliye ayırın.

## Katkıda Bulunma

Sorunlar (issue) ve çekme istekleri (pull request) memnuniyetle karşılanır. HUD çıktısını değiştirdikten sonra `npm test` ve Codex eklenti doğrulayıcısını çalıştırın. Manifest sürümünü değiştirdikten veya release aldıktan sonra manuel test için yerel eklenti önbelleğini `codex plugin add codex-hud@codex-hud` ile yenileyin, ardından güncellenmiş skill metadatasının yüklenmesi için yeni bir Codex thread başlatın.

## Lisans

[MIT](LICENSE) © Brandon Wie
