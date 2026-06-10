**Language** · [English](README.md) | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | Español

<div align="center">

# Codex HUD

**Un HUD de espacio de trabajo compacto y con colores para la CLI de OpenAI Codex: modelo, proyecto, git, contexto y uso de 5h/7d en una sola línea de pie de página.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#configuración)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#inicio-rápido)

[Características](#características) · [Inicio rápido](#inicio-rápido) · [Configuración](#configuración) · [Pie de página de Codex parcheado](#pie-de-página-de-codex-parcheado) · [Hoja de ruta](#hoja-de-ruta)

</div>

---

Codex HUD es un plugin local de Codex que renderiza un HUD de espacio de trabajo multilínea para las sesiones de la CLI de OpenAI Codex.

De forma predeterminada es un complemento de la `[tui].status_line` nativa de Codex, porque Codex de fábrica expone un arreglo configurable de elementos de estado integrados, pero no un renderizador propiedad del plugin. Este repositorio también incluye una ruta de parche mantenida para quienes quieran que el script del HUD se renderice directamente en el pie de página real de Codex.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Los segmentos, las etiquetas, los colores y los umbrales de esa línea son todos configurables; consulta [Configuración](#configuración).

## Características

- Versión de Codex, modelo, esfuerzo de razonamiento, sandbox y modo de aprobación
- Recuento de elementos de la línea de estado nativa de Codex y configuración de color
- Uso compacto analizado a partir de los registros de rollout de Codex (el pie de página de ejemplo de arriba)
- Directorio de trabajo actual, rama de git, recuentos de cambios sin confirmar y raíz del repositorio
- Pistas del proyecto como el nombre del paquete, el `AGENTS.md` cercano y la prioridad de `ACTIVE-STATUS.md` de 3B cuando está presente
- Recuentos de eventos de hooks de Codex desde `hooks.json`
- Una nota clara de que la línea de estado nativa de Codex sigue siendo la autoridad para los valores en vivo de tokens y de límite de tasa

## Inicio rápido

Clona el repositorio y luego instálalo como un plugin local de Codex:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Registra este repositorio como un marketplace de plugins local y luego agrega el plugin:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

A continuación instala el lanzador HUD (recomendado). El modo predeterminado **delega en tu instalación real de Codex**, de modo que las actualizaciones de Codex vía Homebrew/npm se aplican automáticamente — sin recompilaciones ni binarios parcheados:

```bash
npm run install:launcher                    # instala ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # opcional: que `codex` resuelva al lanzador
rehash
```

Consulta la sección «Lanzador HUD» más abajo para los detalles y `npm run doctor` para diagnósticos.

Inicia un nuevo hilo de Codex después de instalar o reinstalar para que la lista de skills se actualice.

> **Consejo:** `codex plugin marketplace add "$(pwd)"` lee el directorio actual, así que ejecútalo desde la raíz del repositorio. También puedes pasar una ruta explícita en lugar de `"$(pwd)"`.

## Uso

Ejecuta el renderizador directamente durante el desarrollo:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # HUD multilínea
node plugins/codex-hud/scripts/codex-hud.js --line     # una sola línea compacta
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # legible por máquina
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # actualiza cada 5s
npm test
```

Captura de terminal del pie compacto predeterminado:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

Ejecuta `node plugins/codex-hud/scripts/codex-hud.js --line --color` localmente para ver el mismo pie con estilos de color ANSI.

## Configuración

El pie de página es configurable mediante un `codex-hud.toml` opcional. Sin un archivo de configuración obtienes el pie de página predeterminado mostrado arriba; cada clave es opcional y todo lo que omitas hereda el valor predeterminado integrado.

```bash
codex-hud --init-config     # genera ~/.codex/codex-hud.toml (--force para sobrescribir)
codex-hud --print-config    # imprime la configuración resuelta y combinada como JSON
codex-hud --config-path     # muestra qué archivos de configuración están en uso
```

### Orden de búsqueda

Las fuentes posteriores tienen prioridad sobre las anteriores (por clave: los arreglos se reemplazan, los escalares se sobrescriben):

1. valores predeterminados integrados
2. `$CODEX_HOME/codex-hud.toml` (por usuario; `$CODEX_HOME` toma `~/.codex` por defecto)
3. `./.codex/codex-hud.toml` (por proyecto; sube hasta la raíz de git)
4. `$CODEX_HUD_CONFIG` (ruta de archivo explícita mediante variable de entorno)

Un archivo ausente no es problema. Un archivo malformado o inválido se ignora: el HUD recurre a los valores predeterminados e imprime una nota de una línea en stderr, de modo que la línea de estado nunca se rompe. codex-hud mantiene su propio archivo en lugar de una tabla dentro del `config.toml` de Codex, así una configuración de HUD defectuosa nunca puede impedir que Codex se inicie.

### Opciones

```toml
# Compacto por defecto. Establece true para espaciado de segmentos " | " y etiquetas ": ".
space = false

# Texto colocado entre segmentos. La opción space controla el relleno alrededor de este texto.
separator = "|"

# Qué segmentos mostrar, en orden. Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Alias: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" está disponible pero desactivado por defecto; agrégalo para activarlo.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Renombra la etiqueta de un segmento (las claves son ids de segmento).
[labels]
ctx = "Ctx"

# Colores: un nombre de paleta, un código de 256 colores (0-255) o "#rrggbb" (mapeado al
# color 256 más cercano). Nombres: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit son los colores de umbral compartidos por ctx / 5h / 7d.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Umbrales de porcentaje (0-100) que cambian ctx/5h/7d entre ok/warn/crit.
[thresholds.percent]
warn = 70
crit = 90

# Conmutadores de formato.
[format]
tokenParts = true   # false -> solo total, oculta (I:.. O:.. C:..)
showPace = true     # false -> oculta el % de ritmo en 5h/7d
```

Ejecuta `codex-hud --print-config` para ver el conjunto completo de opciones resueltas.

## Lanzador HUD (delegación al Codex original — predeterminado)

`npm run install:launcher` escribe `~/.local/bin/codex-hud-tui`, un pequeño lanzador que localiza tu instalación real (original) de Codex y la ejecuta con `exec -a codex`, de modo que integraciones de terminal como Herdr siguen reconociendo el panel como una sesión de Codex. La ruta del binario original se fija en el momento de la instalación, con un mecanismo de respaldo en tiempo de ejecución que vuelve a buscar Codex en el `PATH` (omitiendo todas las entradas gestionadas por el HUD, así el lanzador nunca puede ejecutarse a sí mismo de forma recursiva).

Como el lanzador delega en el Codex original:

- Las actualizaciones de Codex vía Homebrew/npm se aplican automáticamente — sin recompilaciones.
- Tus archivos de Codex original/Homebrew nunca se modifican ni se reemplazan.
- `npm run install:launcher -- --make-default` instala el shim gestionado `~/.local/bin/codex`; el instalador se niega a reemplazar un `codex` no gestionado salvo que pases `--force-shim`.

Para eliminar solo el shim gestionado:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` imprime el estado completo de la cadena de arranque — shim, modo del lanzador (stock/patched/legacy), ruta y versión del Codex original, versiones de payloads parcheados, obsolescencia y artefactos residuales:

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

Solo devuelve un código distinto de cero cuando la cadena de entrada activa está rota.

### Migración desde una instalación anterior de codex-hud

Si antes ejecutabas `npm run patch:codex` (el flujo predeterminado antiguo), ejecuta una vez `npm run install:launcher`: reescribe `codex-hud-tui` a delegación al original y tu shim `codex` existente sigue funcionando. Un comando legado `codex-hud-codex` sano se conserva (con un aviso de obsolescencia); uno roto se pone en cuarentena como `codex-hud-codex.broken-<timestamp>` para que falle rápido en lugar de morir a mitad del arranque. El siguiente `npm run patch:codex` migra automáticamente un payload plano legado al diseño por versiones. `npm run doctor` muestra cualquier resto.

## Experimental: pie de página de Codex parcheado

> **Advertencia — experimental.** Este modo compila un binario de Codex parcheado localmente y sin firmar. macOS puede matar recompilaciones sin firma (el instalador verifica cada payload *antes* de activarlo, así que una compilación fallida nunca puede romper tu `codex` activo), y el binario parcheado **queda obsoleto cuando el Codex original se actualiza** — debes volver a ejecutar `npm run patch:codex` tras cada actualización de Codex. Prefiere el lanzador con delegación predeterminado salvo que necesites específicamente el pie de página dentro de la TUI.

El Codex original no puede renderizar salida arbitraria de plugins bajo el área de entrada. Para obtener un pie de página al estilo Claude HUD, compila un comando de Codex parcheado independiente:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

El instalador parchea la etiqueta de OpenAI Codex correspondiente, compila la CLI en Rust y deja el ejecutable preparado en `~/.local/bin/codex-hud-codex.d/<version>/codex`. El payload preparado debe superar una verificación `--version` **antes** de activarse; solo entonces `~/.local/bin/codex-hud-codex` se redirige atómicamente al nuevo payload, y la versión anterior se conserva en disco para reversión. Una compilación fallida se aparta como `<version>.failed` y el runtime activo queda intacto. También escribe `~/.local/bin/codex-hud-tui` en modo parcheado, un lanzador que pasa el comando HUD a color mediante el override `-c tui.status_line_command=...` de Codex sin tocar `~/.codex/config.toml`. Tanto la ruta del ejecutable como `argv[0]` conservan nombres visibles como Codex, de modo que integraciones como Herdr siguen reconociendo el panel como sesión de Codex.

El modo de lanzador seguro no toca tu comando `codex` habitual:

```bash
codex-hud-tui
```

Para que un arranque nuevo de `codex` use la TUI con HUD, activa el shim gestionado de forma explícita:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` debería resolver a `~/.local/bin/codex`. El instalador se niega a reemplazar un `~/.local/bin/codex` existente salvo que pases `--force-shim`, y también se niega a instalar el binario parcheado como `codex` salvo que pases `--replace-codex`.

La reversión elimina solo el shim `codex` gestionado:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Si prefieres una configuración persistente, añade la línea impresa bajo tu tabla `[tui]` existente, aunque ten en cuenta que las versiones originales de Codex pueden rechazar campos desconocidos. Genera la línea exacta para tu máquina desde la raíz del repositorio:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Luego pégala bajo `[tui]` en `~/.codex/config.toml`:

```toml
# Replace /path/to/codex-hud with your local clone path.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Ejecuta `codex-hud-tui` para ver el pie de página compacto. El binario parcheado no sigue las actualizaciones del Codex original: si el Codex original cambia tras una compilación, el lanzador parcheado imprime una advertencia de una línea al arrancar (y aun así ejecuta el binario parcheado que elegiste) — recompila con `npm run patch:codex` o vuelve a la delegación con `npm run install:launcher`. Cada recompilación se prepara, se verifica y se activa atómicamente; la versión anterior funcional queda bajo `~/.local/bin/codex-hud-codex.d/` para reversión, y `npm run doctor` informa de obsolescencia y payloads rotos. Con el shim `codex` gestionado activo, el instalador lo omite al detectar la versión base de Codex y usa el siguiente `codex` real del `PATH`; pasa `--version <version>` si necesitas fijar explícitamente el objetivo de recompilación.
## Estructura del proyecto

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # renderizador del HUD + cargador de configuración
│     ├─ vendor/toml.js              # analizador TOML incluido (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # regenera vendor/toml.js
   └─ install-patched-codex.js
```

## Hoja de ruta

- Agregar resúmenes de transcripción de sesión más completos si Codex expone una API local estable de estado de sesión para plugins.
- Dar seguimiento al issue upstream de OpenAI Codex [#17827](https://github.com/openai/codex/issues/17827). Al 2026-06-10, Codex estándar aún tiene elementos integrados de `[tui].status_line`, pero no un renderizador basado en comandos ni propiedad de plugins; retira el parche solo cuando se publique un renderizador personalizado compatible.

## Contribuir

Los issues y los pull requests son bienvenidos. Después de cambiar la salida del HUD, ejecuta `npm test` y el validador de plugins de Codex. Después de cambiar la versión del manifiesto o publicar una release, actualiza la caché local del plugin para pruebas manuales con `codex plugin add codex-hud@codex-hud` e inicia un nuevo hilo de Codex para cargar los metadatos actualizados de la skill.

## Licencia

[MIT](LICENSE) © Brandon Wie
