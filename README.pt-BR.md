**Language** · [English](README.md) | Português (Brasil) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**Um HUD de workspace compacto e colorido para a CLI do OpenAI Codex — modelo, projeto, git, contexto e uso de 5h/7d em uma única linha de rodapé.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#configuração)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#início-rápido)

[Recursos](#recursos) · [Início Rápido](#início-rápido) · [Configuração](#configuração) · [Rodapé do Codex com Patch](#rodapé-do-codex-com-patch) · [Roadmap](#roadmap)

</div>

---

O Codex HUD é um plugin local do Codex que renderiza um HUD de workspace multilinha para sessões da CLI do OpenAI Codex.

Por padrão, ele é um complemento do `[tui].status_line` nativo do Codex, porque o Codex de fábrica expõe um array configurável de itens de status embutidos, mas não um renderizador controlado por plugin. Este repositório também oferece um caminho de patch mantido para quem deseja que o script do HUD renderize diretamente no rodapé real do Codex.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> Os segmentos, rótulos, cores e limites dessa linha são todos configuráveis — veja [Configuração](#configuração).

## Recursos

- Versão do Codex, modelo, esforço de raciocínio, sandbox e modo de aprovação
- Contagem de itens da status line nativa do Codex e configuração de cor
- Uso compacto analisado a partir dos logs de rollout do Codex (o rodapé de exemplo acima)
- Diretório de trabalho atual, branch do git, contagens de alterações pendentes e raiz do repositório
- Dicas do projeto, como nome do pacote, `AGENTS.md` próximo e a prioridade do `ACTIVE-STATUS.md` do 3B quando presente
- Contagens de eventos de hook do Codex a partir do `hooks.json`
- Uma observação clara de que a status line nativa do Codex continua sendo a fonte autoritativa para os valores ao vivo de tokens e limite de taxa

## Início Rápido

Clone o repositório e instale-o como um plugin local do Codex:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Registre este repositório como um marketplace de plugins local e, em seguida, adicione o plugin:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

> **⚠️ Update:** the recommended next step is now `npm run install:launcher` (stock-delegating launcher; Codex updates are picked up automatically). See the [English README](./README.md#quick-start) until this translation is updated.

Inicie uma nova thread do Codex após instalar ou reinstalar para que a lista de skills seja atualizada.

> **Dica:** `codex plugin marketplace add "$(pwd)"` lê o diretório atual, então execute-o a partir da raiz do repositório. Você também pode passar um caminho explícito em vez de `"$(pwd)"`.

## Uso

Execute o renderizador diretamente durante o desenvolvimento:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # HUD multilinha
node plugins/codex-hud/scripts/codex-hud.js --line     # linha compacta única
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # legível por máquina
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # atualiza a cada 5s
npm test
```

Captura de terminal do rodape compacto padrao:

```text
$ node plugins/codex-hud/scripts/codex-hud.js --line
5.5xhigh|codex-hud|git(main)|Ctx:50%|5h:4%(4.0h,21%)|7d:20%(4.9d,30%)|Tkn:5.6M(I:2.9M,O:20k,C:2.7M)
```

Execute `node plugins/codex-hud/scripts/codex-hud.js --line --color` localmente para ver o mesmo rodape com estilos de cor ANSI.

## Configuração

O rodapé é configurável através de um `codex-hud.toml` opcional. Sem arquivo de configuração, você obtém o rodapé padrão mostrado acima; toda chave é opcional e tudo o que você omitir herda o padrão embutido.

```bash
codex-hud --init-config     # cria a estrutura de ~/.codex/codex-hud.toml (--force para sobrescrever)
codex-hud --print-config    # imprime a configuração resolvida e mesclada como JSON
codex-hud --config-path     # mostra quais arquivos de configuração estão em vigor
```

### Ordem de busca

As fontes posteriores sobrescrevem as anteriores (por chave — arrays substituem, escalares sobrescrevem):

1. padrões embutidos
2. `$CODEX_HOME/codex-hud.toml` (por usuário; `$CODEX_HOME` tem como padrão `~/.codex`)
3. `./.codex/codex-hud.toml` (por projeto; sobe até a raiz do git)
4. `$CODEX_HUD_CONFIG` (caminho de arquivo explícito via variável de ambiente)

Um arquivo ausente não é problema. Um arquivo malformado ou inválido é ignorado — o HUD recorre aos padrões e imprime uma observação de uma linha no stderr, de modo que a status line nunca quebra. O codex-hud mantém seu próprio arquivo em vez de uma tabela dentro do `config.toml` do Codex, então uma configuração ruim do HUD nunca pode impedir o Codex de iniciar.

### Opções

```toml
# Compacto por padrão. Defina como true para espaçamento de segmentos " | " e rótulos ": ".
space = false

# Texto colocado entre os segmentos. A flag space controla o preenchimento ao redor desse texto.
separator = "|"

# Quais segmentos exibir, em ordem. Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Apelidos: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" está disponível, mas desativado por padrão — adicione-o para optar por incluí-lo.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Renomeia o rótulo de um segmento (as chaves são ids de segmento).
[labels]
ctx = "Ctx"

# Cores: um nome de paleta, um código de cor de 256 (0-255) ou "#rrggbb" (mapeado para a
# cor de 256 mais próxima). Nomes: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit são as cores de limite compartilhadas por ctx / 5h / 7d.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Limites percentuais (0-100) que alternam ctx/5h/7d entre ok/warn/crit.
[thresholds.percent]
warn = 70
crit = 90

# Alternadores de formatação.
[format]
tokenParts = true   # false -> apenas total, oculta (I:.. O:.. C:..)
showPace = true     # false -> oculta o % de ritmo em 5h/7d
```

Execute `codex-hud --print-config` para ver o conjunto completo de opções resolvidas.

## Rodapé do Codex com Patch

> **⚠️ Outdated section — install/update flow changed.** Stock delegation (`npm run install:launcher`) is now the default and picks up Codex updates automatically; the patched build below is **experimental and opt-in**. See the [English README](./README.md#experimental-patched-codex-footer) for current instructions until this translation is updated.

O Codex de fábrica não consegue renderizar saída arbitrária de plugin abaixo da área de entrada. Para obter um rodapé no estilo Claude-HUD, construa um comando Codex separado com patch:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

O instalador aplica o patch à tag correspondente do OpenAI Codex, compila a CLI em Rust e mantém o executável real em `~/.local/bin/codex-hud-codex.d/codex`, com `~/.local/bin/codex-hud-codex` como um symlink para esse binário. Ele também grava `~/.local/bin/codex-hud-tui`, um launcher que passa o comando colorido do HUD através do override `-c tui.status_line_command=...` do Codex sem alterar o `~/.codex/config.toml`. Tanto o caminho do executável quanto o `argv[0]` mantêm nomes visíveis ao Codex, então integrações de terminal como o Herdr ainda conseguem reconhecer o painel como uma sessão do Codex.

O modo de launcher seguro deixa o seu comando `codex` normal intacto:

```bash
codex-hud-tui
```

Para fazer com que um novo lançamento do `codex` use o TUI com HUD habilitado, opte por incluir o shim gerenciado:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` deve resolver para `~/.local/bin/codex`. O instalador se recusa a substituir um `~/.local/bin/codex` existente a menos que você passe `--force-shim`, e ainda se recusa a instalar o próprio binário com patch como `codex` a menos que você passe `--replace-codex`.

O rollback remove apenas o shim `codex` gerenciado:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Se você preferir uma configuração persistente, adicione a linha impressa sob a sua tabela `[tui]` existente, mas observe que versões do Codex de fábrica podem rejeitar campos desconhecidos. Gere a linha exata para a sua máquina a partir da raiz do repositório:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Em seguida, cole-a sob `[tui]` em `~/.codex/config.toml`:

```toml
# Substitua /path/to/codex-hud pelo caminho do seu clone local.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Execute `codex-hud-tui` para ver o rodapé compacto. Atualizações do Homebrew ou do Codex não atualizarão esse comando separado; reexecute `npm run patch:codex` após atualizar o Codex. Quando o shim `codex` gerenciado está ativo, o instalador ignora esse shim ao detectar a versão base do Codex e usa o próximo `codex` real no `PATH`; passe `--version <version>` se você precisar fixar explicitamente o alvo de recompilação. O payload recompilado deve passar por uma verificação de saúde com `--version` antes de o launcher ser reescrito.

## Estrutura do Projeto

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # renderizador do HUD + carregador de config
│     ├─ vendor/toml.js              # parser TOML vendorizado (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # regenera vendor/toml.js
   └─ install-patched-codex.js
```

## Roadmap

- Adicionar resumos mais ricos de transcrições de sessão se o Codex expor uma API local estável de estado de sessão para plugins.
- Acompanhar a issue upstream do OpenAI Codex [#17827](https://github.com/openai/codex/issues/17827). Em 2026-06-10, o Codex padrao ainda tem itens embutidos em `[tui].status_line`, mas nao um renderizador baseado em comando ou pertencente a plugin; aposente o patch apenas quando um renderizador customizado suportado for lançado.

## Contribuindo

Issues e pull requests são bem-vindos. Após alterar a saída do HUD, execute `npm test` e o validador de plugins do Codex. Após alterar a versão do manifesto ou publicar uma release, atualize o cache do plugin local para teste manual com `codex plugin add codex-hud@codex-hud` e inicie uma nova thread do Codex para carregar os metadados atualizados da skill.

## Licença

[MIT](LICENSE) © Brandon Wie
