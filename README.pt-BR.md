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

Em seguida, instale o launcher do HUD (recomendado). O modo padrão **delega para a sua instalação real do Codex**, então as atualizações do Codex via Homebrew/npm são aplicadas automaticamente — sem recompilações, sem binários com patch:

```bash
npm run install:launcher                    # instala ~/.local/bin/codex-hud-tui
npm run install:launcher -- --make-default  # opcional: fazer `codex` resolver para o launcher
rehash
```

Veja a seção "Launcher do HUD" abaixo para detalhes e `npm run doctor` para diagnósticos.

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

## Launcher do HUD (delegação ao Codex original — padrão)

`npm run install:launcher` grava `~/.local/bin/codex-hud-tui`, um launcher pequeno que localiza sua instalação real (original) do Codex e a executa com `exec -a codex`, de modo que integrações de terminal como o Herdr continuam reconhecendo o painel como uma sessão do Codex. O caminho do binário original é gravado na instalação, com um fallback em tempo de execução que redescobre o Codex no `PATH` (pulando todas as entradas gerenciadas pelo HUD, então o launcher nunca consegue executar a si mesmo recursivamente).

Como o launcher delega ao Codex original:

- Atualizações do Codex via Homebrew/npm são aplicadas automaticamente — sem recompilações.
- Seus arquivos do Codex original/Homebrew nunca são modificados nem substituídos.
- `npm run install:launcher -- --make-default` instala o shim gerenciado `~/.local/bin/codex`; o instalador se recusa a substituir um `codex` não gerenciado a menos que você passe `--force-shim`.

Para remover apenas o shim gerenciado:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

### Doctor

`npm run doctor` imprime o estado completo da cadeia de inicialização — shim, modo do launcher (stock/patched/legacy), caminho e versão do Codex original, versões de payloads com patch, defasagem e artefatos remanescentes:

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

Sai com código diferente de zero apenas quando a cadeia de entrada ativa está quebrada.

### Migrando de uma instalação antiga do codex-hud

Se você executava `npm run patch:codex` (o fluxo padrão antigo), execute `npm run install:launcher` uma vez: ele reescreve o `codex-hud-tui` para delegação ao original e mantém seu shim `codex` existente funcionando. Um comando legado `codex-hud-codex` saudável é mantido (com um aviso de defasagem); um quebrado é colocado em quarentena como `codex-hud-codex.broken-<timestamp>`, falhando rápido em vez de morrer no meio da inicialização. O próximo `npm run patch:codex` migra automaticamente um payload plano legado para o layout versionado. `npm run doctor` mostra qualquer sobra.

## Experimental: rodapé do Codex com patch

> **Aviso — experimental.** Este modo compila um binário do Codex com patch local e sem assinatura. O macOS pode matar recompilações sem assinatura (o instalador faz health check de cada payload *antes* de ativá-lo, então uma compilação falha nunca quebra o seu `codex` ativo), e o binário com patch **fica defasado quando o Codex original é atualizado** — você precisa executar `npm run patch:codex` novamente após atualizações do Codex. Prefira o launcher padrão com delegação, a menos que você queira especificamente o rodapé dentro da TUI.

O Codex original não consegue renderizar saída arbitrária de plugins abaixo da área de entrada. Para obter um rodapé no estilo Claude HUD, compile um comando do Codex com patch separado:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

O instalador aplica o patch na tag correspondente do OpenAI Codex, compila a CLI em Rust e prepara o executável em `~/.local/bin/codex-hud-codex.d/<version>/codex`. O payload preparado precisa passar em um health check `--version` **antes** de qualquer ativação; só então `~/.local/bin/codex-hud-codex` é redirecionado atomicamente para o novo payload, e a versão anterior é mantida em disco para rollback. Uma compilação falha é guardada como `<version>.failed` e o runtime ativo permanece intocado. Ele também grava `~/.local/bin/codex-hud-tui` no modo com patch, um launcher que passa o comando colorido do HUD pelo override `-c tui.status_line_command=...` do Codex sem alterar `~/.codex/config.toml`. O caminho do executável e o `argv[0]` mantêm nomes visíveis como Codex, então integrações de terminal como o Herdr continuam reconhecendo o painel como sessão do Codex.

O modo seguro do launcher não toca no seu comando `codex` normal:

```bash
codex-hud-tui
```

Para que um novo `codex` use a TUI com HUD, ative o shim gerenciado explicitamente:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` deve resolver para `~/.local/bin/codex`. O instalador se recusa a substituir um `~/.local/bin/codex` existente a menos que você passe `--force-shim`, e também se recusa a instalar o próprio binário com patch como `codex` a menos que você passe `--replace-codex`.

O rollback remove apenas o shim `codex` gerenciado:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

Se preferir uma configuração persistente, adicione a linha impressa sob a sua tabela `[tui]` existente, mas note que versões originais do Codex podem rejeitar campos desconhecidos. Gere a linha exata para a sua máquina a partir da raiz do repositório:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Depois cole sob `[tui]` em `~/.codex/config.toml`:

```toml
# Replace /path/to/codex-hud with your local clone path.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Execute `codex-hud-tui` para ver o rodapé compacto. O binário com patch não acompanha as atualizações do Codex original: se o Codex original mudar depois de uma compilação, o launcher com patch imprime um aviso de uma linha na inicialização (e ainda executa o binário com patch que você escolheu) — recompile com `npm run patch:codex` ou volte para a delegação com `npm run install:launcher`. Cada recompilação é preparada, verificada e ativada atomicamente; a versão funcional anterior fica em `~/.local/bin/codex-hud-codex.d/` para rollback, e `npm run doctor` reporta defasagem e payloads quebrados. Com o shim `codex` gerenciado ativo, o instalador o pula ao detectar a versão base do Codex e usa o próximo `codex` real no `PATH`; passe `--version <version>` se precisar fixar explicitamente o alvo da recompilação.
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
