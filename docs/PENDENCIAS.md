# Pendências do Circle

Estado em **2026-09-02**, com `main` e `develop` sincronizadas na v0.24.0.

> **As [issues](https://github.com/Nimbloo/circle/issues) são a fonte da verdade** sobre
> escopo. Este documento registra o que elas **não** capturam: bloqueios que vivem em
> outro repositório, decisões que dependem de você, e o estado operacional do momento.
>
> **Leia com data na mão.** A seção "Operacional" envelhece em dias; as de decisão e
> bloqueio, em semanas. Se divergir da issue, a issue vence.

---

## Operacional (envelhece rápido)

### Paridade visual com o Linear — [#65](https://github.com/Nimbloo/circle/issues/65)

Implementada nos commits da issue #65, a partir da `develop` atualizada. O trabalho
cobriu dez lotes: tokens e shell, sidebar, headers, listas e boards, superfícies de
workspace, detalhes editoriais, Inbox/Cycles, Settings, overlays e hardening
responsivo/acessível. Não houve mudança de API, schema ou contrato.

A revisão independente final encontrou e fechou lacunas que a primeira passada visual
não capturou: sidebar indisponível em alguns headers móveis, properties de
issue/project/initiative inacessíveis abaixo do breakpoint desktop, regressão nas
preferências persistidas de Projects, `<main>` aninhado no detalhe de issue e um
controle interativo inválido dentro do link de projeto da initiative. Os testes que
congelavam listas de classes Tailwind foram removidos; comportamento de store e
semântica HTML agora têm testes renderizados.

Validação feita em 01/09/2026:

- comparação lado a lado com o Linear autenticado em `linear.app/nimbloo`, incluindo
  medidas de eixos, larguras, alturas, raios e espaçamentos nas superfícies principais;
- rotas principais e todos os grupos de Settings em `390×844`, `768×1024`,
  `1280×800`, `1440×900` e desktop amplo (`1718 px`);
- temas Light, Pure Light, Dark, Magic Blue, Classic Dark e Custom, com restauração da
  preferência original após a auditoria;
- teclado e acessibilidade: foco visível, Space/Enter/Escape, focus trap dos dialogs,
  nomes acessíveis em botões de ícone, switches e comboboxes, além de
  `prefers-reduced-motion`;
- auditoria automatizada em `390×844`: sidebar e drawers de properties abriram nas
  quatro rotas críticas, com close visível, focus trap, zero botão sem nome, um único
  landmark `main` e nenhum `main` aninhado. Em `1440×900`, houve um único trigger
  visual por header e os três asides editoriais permaneceram visíveis;
- `pnpm typecheck`, `pnpm lint`, 59 arquivos/343 testes e `pnpm build` passaram. A build
  manteve apenas o warning preexistente de serialização de strings grandes no cache do
  webpack; não houve erro de compilação.

Divergências intencionais: o conteúdo continua vindo dos dados reais do Circle; não
foram inventadas ações só para imitar o benchmark. Em
`/settings/project-statuses`, o título permanece **Issue statuses** porque a tela edita
o catálogo de status de issues existente — chamá-la de Project statuses seria
semanticamente incorreto. As variantes de tema próprias do Circle foram preservadas;
o Linear é o benchmark de composição, densidade e interação, não uma razão para apagar
preferências do produto.

**Promovida para produção na release
[v0.21.0](https://github.com/Nimbloo/circle/releases/tag/v0.21.0).** O rollout ficou
`Synced/Healthy` no ArgoCD, com probes de health/readiness em `200`, pod sem reinícios e
o digest da tag SemVer idêntico ao executado. `main` e `develop` estão sincronizadas.

**Política dos arquivos de agente resolvida.** `AGENTS.md` é a fonte única do guia do
projeto; `CLAUDE.md` só o importa (`@AGENTS.md`). A seção _Continuidade entre agentes_ do
`AGENTS.md` define o handoff Codex ↔ Claude: bloco **Estado** no plano em
`docs/superpowers/plans/`, atualizado ao fechar cada task. `.agents/` fica no `.gitignore`:
os 59 arquivos locais eram cópias byte a byte das skills instaladas pelo plugin global, não
fonte do produto.

### Paridade de interação com o Linear — [#25](https://github.com/Nimbloo/circle/issues/25), 2ª leva

Segunda leva depois da visual (v0.21.0), na branch `danilo/linear-interaction-parity`:
splitter persistido da Inbox (lista de 300 px mínimo, até 50% da área, largura salva),
navegação hierárquica por teclado nos filtros (ArrowRight/Enter avança, ArrowLeft/Escape
volta, Escape na raiz fecha e devolve o foco ao gatilho), token `--sidebar-hover` distinto
do selecionado, botões de opções como controles reais (28 × 28 px, `aria-label`), criação
inline de initiative com card de 112 px animado e pickers (ícone/emoji/cor, status,
prioridade, owner, período, labels) e painel de detalhes com toggle persistido (400 px, sem
coluna residual).

Contrato **aditivo** de initiatives, autorizado na spec
(`docs/superpowers/specs/2026-09-01-linear-interaction-parity-design.md`): tabela
`initiative_label`, coluna `icon_color`, `icon` ampliado para 64 chars (migration 0033, sem
DROP). Inputs `labelIds`/`iconColor` opcionais; DTO ganha `labels` e `iconColor`.

Validação em 02/09/2026, dark, `1424×771` — o Chrome desta máquina ignorou o resize de
janela, então os viewports `390`/`768`/`1728` e o tema light **não** foram cobertos
manualmente (os tokens light existem em `globals.css` e os testes renderizados cobrem
store e semântica): splitter (drag, clamp em 300, largura após reload), criação de
initiative (toast só após a API, ícone/cor e label persistidos no GET), toggle de detalhes
(foco preservado no botão, estado após reload), filtro de initiatives por teclado.
`pnpm typecheck`, `pnpm lint`, 67 arquivos/379 testes e `pnpm build` verdes. Único ajuste
da auditoria: `defaultSize` no painel de detalhe do Inbox (warning de layout shift do
`react-resizable-panels` no SSR). Observado uma única vez e **não reproduzido**: lista do
Inbox abrindo com 424 px em vez de 300 numa janela de 1718 px — se voltar, olhar a
interação entre `onResize` e o `useLayoutEffect` que aplica a largura do store.

**Promovida para produção na release
[v0.22.0](https://github.com/Nimbloo/circle/releases/tag/v0.22.0)** (PRs #75 e #76). O
Image Updater trocou a tag em ~4 min após o push no ECR; rollout `Synced/Healthy`,
migração `0033` aplicada no boot (34/34), `healthz`/`readyz` em `200`, pod sem reinícios.

**Complemento na release
[v0.22.1](https://github.com/Nimbloo/circle/releases/tag/v0.22.1)** (PRs #78 e #79): a
lacuna de tema light e viewports foi fechada com emulação headless do Chrome instalado
(`puppeteer-core`, sem download de navegador), em light e dark, `390×844`, `768×1024` e
`1728×1200`: sem scroll horizontal, zero botão de ícone sem nome, Sheet de propriedades
com labels no mobile/tablet, splitter da Inbox e aside de 400 px só no desktop. Dois fixes
saíram daí: a linha de chips do card inline de initiative tinha altura fixa e sobrepunha os
inputs em 390 px; o seletor compacto de prioridade dos cards do board não tinha nome
acessível. Rollout `Synced/Healthy`, `healthz`/`readyz` em `200`. O iframe same-origin não
serve para emular viewport aqui: o app envia `frame-ancestors 'none'` e
`X-Frame-Options: DENY` (correto).

---

## Bloqueado em outro repositório

Nada aqui avança só com código deste repo.

### Imagem ARM — [#27](https://github.com/Nimbloo/circle/issues/27)

Único item restante da issue (gate de CI, tag e release já saíram). O build é
`linux/amd64`; mudar exige trocar o `nodeSelector` para `default-arm` no chart
`circle-prd` do `nimbloo-k8s` **na mesma janela**. Publicar ARM-only sozinho derruba a
produção com `exec format error`.

Caminho seguro: publicar **multi-arch** primeiro (`linux/amd64,linux/arm64`) — o
manifesto serve as duas — e mover o chart depois, sem coordenação. Custo a medir: build
arm64 cross-compilado por QEMU é lento.

### Tracing para o Tempo — [#28](https://github.com/Nimbloo/circle/issues/28)

A metade de **logging já saiu**: 113 das 130 chamadas a `handle()` não passavam `req`,
então logavam erro sem rota e registravam `method=UNKNOWN` — 87% do tráfego invisível na
métrica. Corrigido, com guarda (`test/handle-req-guard.test.ts`).

Falta o exporter OTel, que exige **validar a ingestão no cluster**. A armadilha, já
registrada no CLAUDE.md global e vivida aqui com o Sentry: endpoint configurado sem o
reporter ativo fica _"configurado e mudo"_ — pior que não ter, porque dá impressão de
cobertura.

### Sentry — DSN

O SDK está nos três runtimes e o build já injeta `NEXT_PUBLIC_SENTRY_DSN` como build arg
(`Dockerfile` + `vars.NEXT_PUBLIC_SENTRY_DSN` no CI). O projeto `circle` ainda **não
existe no Sentry**. Falta criá-lo, cadastrar o DSN na variável de repo e mergear o
[PR #645 no `nimbloo-k8s`](https://github.com/Nimbloo/nimbloo-k8s/pull/645) (env de
runtime, necessário para o lado servidor).

⚠️ **`NEXT_PUBLIC_*` é embutido no bundle do browser em tempo de build.** Definir o DSN só
no chart ativaria server e edge e deixaria o **cliente mudo** — foi um bug real da
implementação original, corrigido, mas a pegadinha continua valendo para qualquer
`NEXT_PUBLIC_*` novo.

---

### Front — estado, filtros e sidebar (auditoria de 02/09/2026)

Auditoria read-only da arquitetura de estado (spec
`docs/superpowers/specs/2026-09-02-sidebar-e-estado-design.md`). O que saiu na mesma leva:
collapse da sidebar animado e persistido por time; `workspace.hydrate` coalescido (uma
chamada concorrente não é mais descartada) e auto-rollover de cycles só no boot (antes, ~25
refetches pós-mutação disparavam a escrita); filtros `is not` corretos para issue sem
projeto/criador/data, opções "No project"/"No creator", tabs preservando `?filters=`;
"Show sub-issues" removido do Display (o domínio não tem sub-issues). Promovido na release [v0.24.0](https://github.com/Nimbloo/circle/releases/tag/v0.24.0) (PRs #84 e #85).

**Ficou para depois, em ordem de valor:**

- **Display settings por view.** Hoje grouping/ordering/propriedades são um conjunto
  global em localStorage: escolher no board do time A vaza para cycle, project e
  my-issues. Linear é por view. Chavear o persist por rota (ou salvar no servidor por
  view).
- **Painel lateral unificado (`DetailSidePanel`).** Initiative, project e issue divergem:
  toggle persistido só na initiative, larguras/breakpoints diferentes (aside `xl`
  400 px vs container query `@7xl`), Sheet mobile com paddings e triggers distintos, e
  "Properties" duplicado inline + aside em initiative e project.
- **`right-panel-store` por rota.** Abrir Insights na lista de issues e navegar para um
  projeto mostra Insights no lugar de Properties; não há reset na troca de rota.
- **Preferências de layout no servidor.** Só theme/notifications/preferences sincronizam;
  display, view-store, sidebar e initiative-details ficam por dispositivo.
- **De-para pixel do painel de initiatives com o Linear.** Bloqueado: a extensão
  Claude-in-Chrome está sem permissão para `linear.app` (navegação recusada). Liberar o
  domínio na extensão para medir hover/spacing/tipografia ao vivo.

**Produção — checks dos PRs em 0/0.** O `GITHUB_TOKEN` do Secrets Manager é um PAT
fine-grained sem a permissão **Checks: Read-only** (`/check-runs` devolve 403 "Resource
not accessible by personal access token"; `/files` e `/commits` funcionam). Ajustar as
permissões do token no GitHub e rodar o sync de novo — nada a mudar no código.

## Decisões suas (não é falta de código)

### Datas reais em iniciativas

`target` é `varchar` livre e aceita `"Q3 2026"`. Criar `startDate`/`targetDate` como as de
project é trivial; **o que fazer com os valores já gravados** não é — não convertem para
data sem perda. Manter os dois campos, migrar o que der e descartar o resto, ou deixar
como está.

### Estratégia de snapshot para cycles — [#24](https://github.com/Nimbloo/circle/issues/24)

O `scopeDelta` real exige saber **quando a issue entrou no ciclo**, e isso não existia. A
gravação desse histórico **começou** (eventos de `cycle` e `estimate` agora registram de/
para, e o auto-add passou a emitir evento), mas o dado retroativo não existe.

Para fechar, é preciso `cycle_snapshot(cycle_id, date, scope, started, completed)` com
`UNIQUE(cycle_id, date)`. **Onde rodar o job é a decisão:** o app não tem scheduler e o
chart não tem CronJob. Ou se adiciona um CronJob, ou se faz upsert idempotente no
bootstrap — lazy, igual ao rollover, sem infra nova, com buracos em dias sem acesso
(interpoláveis).

### Editor de blocos — [#16](https://github.com/Nimbloo/circle/issues/16)

Maior item isolado do backlog. Antes de começar: escolher a biblioteca e **o formato de
storage** dos blocos. Hoje a descrição é texto plano e `textToBlocks` só emite `paragraph`.

---

## Construção de produto

Roadmap, não limpeza. Priorize por valor.

| Issue                                              | O que falta de verdade                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#19](https://github.com/Nimbloo/circle/issues/19) | **Só dois itens**: DnD no board de projetos e reschedule no timeline. Health do update, resources edit/remove e delete de milestone **já estão prontos** — a descrição original está obsoleta. O repo já tem `react-dnd`. Nota: o board agrupa por **time** por default, então "DnD muda status" precisa de revalidação do requisito. |
| [#22](https://github.com/Nimbloo/circle/issues/22) | Webhook, "For you/Created" e **arquivos/commits/diff + checks reais já saíram** (tabelas `review_file`/`review_commit`, Checks API, abas Overview/Guide/Diff, webhook `check_run`). Restam: Guide narrado (sem fonte de dados hoje) e notas/comentários de review.                                                                    |
| [#24](https://github.com/Nimbloo/circle/issues/24) | Cool-down (não existe em lugar nenhum do repo) e snapshots — ver decisão acima. Burn-up real **já saiu**.                                                                                                                                                                                                                             |
| [#16](https://github.com/Nimbloo/circle/issues/16) | Editor de blocos — ver decisão acima.                                                                                                                                                                                                                                                                                                 |
| [#25](https://github.com/Nimbloo/circle/issues/25) | Épico de paridade com o Linear. Serve para **fatiar**, não para executar.                                                                                                                                                                                                                                                             |

---

## O que este documento existe para lembrar

Em 31/08–01/09 foram auditadas todas as issues abertas e a leva fechada em 28/08. **Sete
issues descreviam como ausente algo que já estava construído**, e **duas foram fechadas
sem a aceitação cumprida** (#20, com 2 de 3 critérios; #24, com 1 de 3 — esta foi
reaberta).

Mais importante: os problemas que causaram estrago real **não estavam em issue nenhuma**.
Um bypass de autenticação, perda silenciosa de vínculo de projeto, membro fantasma sem
acesso, 87% da métrica HTTP cega, Sentry que reportaria pela metade, variação de escopo
de ciclo que nunca renderiza — todos pareciam prontos.

Daí os **seis guardas estruturais** no CI, que falham a build quando a classe do bug
volta:

| Guarda                          | O que impede                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| `route-auth-guard`              | Rota nova sob `/api/v1` nascer sem checagem de autenticação                 |
| `store-selector-guard`          | Assinar getter do zustand e chamá-lo fora do seletor (componente congelado) |
| `handle-req-guard`              | Chamada a `handle()` sem `req` (log sem rota, métrica `UNKNOWN`)            |
| `view-filter-parity`            | Filtro de view divergir entre servidor e cliente                            |
| `insights-matrix-parity`        | Matriz status × prioridade divergir entre servidor e cliente                |
| `no-use-before-define` (ESLint) | Usar variável antes da declaração em seletor síncrono — o crash de Cycles   |

**A régua daqui pra frente:** ao pegar uma issue, verifique no código antes de construir.
Sete vezes em dois dias a descrição estava errada.
