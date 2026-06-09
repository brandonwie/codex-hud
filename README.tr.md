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

## Yamalı Codex Altbilgisi

Standart Codex, giriş alanının altında rastgele eklenti çıktısı oluşturamaz. Claude-HUD tarzı bir altbilgi elde etmek için ayrı, yamalı bir Codex komutu derleyin:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

Yükleyici, eşleşen OpenAI Codex etiketini yamalar, Rust CLI'yi derler ve gerçek yürütülebilir dosyayı `~/.local/bin/codex-hud-codex.d/codex` altında tutar; `~/.local/bin/codex-hud-codex` ise o ikili dosyaya bir sembolik bağlantıdır. Ayrıca, renkli HUD komutunu `~/.codex/config.toml` dosyasını değiştirmeden Codex'in `-c tui.status_line_command=...` geçersiz kılması aracılığıyla geçiren bir başlatıcı olan `~/.local/bin/codex-hud-tui` dosyasını da yazar. Yürütülebilir dosya yolu ve `argv[0]` her ikisi de Codex tarafından görülebilen adları korur, böylece Herdr gibi terminal entegrasyonları bölmeyi hâlâ bir Codex oturumu olarak tanıyabilir.

Güvenli başlatıcı modu, normal `codex` komutunuza dokunmaz:

```bash
codex-hud-tui
```

Yeni bir `codex` başlatmanın HUD özellikli TUI'yi kullanmasını sağlamak için, yönetilen shim'i etkinleştirin:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex`, `~/.local/bin/codex` ile çözümlenmelidir. Yükleyici, `--force-shim` geçirmediğiniz sürece mevcut bir `~/.local/bin/codex` dosyasını değiştirmeyi reddeder ve `--replace-codex` geçirmediğiniz sürece yamalı ikili dosyanın kendisini `codex` olarak kurmayı da reddeder.

Geri alma, yalnızca yönetilen `codex` shim'ini kaldırır:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Kalıcı bir yapılandırmayı tercih ederseniz, yazdırılan satırı mevcut `[tui]` tablonuzun altına ekleyin, ancak standart Codex sürümlerinin bilinmeyen alanları reddedebileceğini unutmayın. Makineniz için tam satırı depo kökünden oluşturun:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Ardından bunu `~/.codex/config.toml` içindeki `[tui]` altına yapıştırın:

```toml
# /path/to/codex-hud kısmını yerel klon yolunuzla değiştirin.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Kompakt altbilgiyi görmek için `codex-hud-tui` çalıştırın. Homebrew veya Codex güncellemeleri bu ayrı komutu güncellemez; Codex'i güncelledikten sonra `npm run patch:codex` komutunu yeniden çalıştırın. Yönetilen `codex` shim'i etkin olduğunda, yükleyici temel Codex sürümünü algılarken o shim'i atlar ve `PATH` üzerindeki bir sonraki gerçek `codex` dosyasını kullanır; yeniden derleme hedefini açıkça sabitlemeniz gerekirse `--version <version>` geçirin. Yeniden derlenen yük, başlatıcı yeniden yazılmadan önce bir `--version` sağlık kontrolünü geçmelidir.

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
- Desteklenen bir özel oluşturucu çıkarsa yamanın kaldırılabilmesi için Codex durum satırındaki yukarı akış değişikliklerini takip etmek.
- Codex eklenti dizini kartı yayınlanmaya hazır olduğunda ekran görüntüleri eklemek.

## Katkıda Bulunma

Sorunlar (issue) ve çekme istekleri (pull request) memnuniyetle karşılanır. HUD çıktısını değiştirdikten sonra `npm test` ve Codex eklenti doğrulayıcısını çalıştırın; manifest sürümünü değiştirdikten sonra yerel eklentiyi `codex plugin add codex-hud@codex-hud` ile yeniden kurun.

## Lisans

[MIT](LICENSE) © Brandon Wie
