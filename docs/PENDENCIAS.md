# Pendências do Circle

Estado em **2026-09-03**, com `main` e `develop` sincronizadas na v0.28.0.

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
`docs/superpowers/specs/2026-09-02-sidebar-e-estado-design.md`) e, na sequência, a
quitação dos nove itens de débito (spec `2026-09-02-debito-front-design.md`, plano
`2026-09-02-debito-front.md`):

1. **Display settings por view** — grouping/ordering/propriedades e list/board são por
   rota (`lib/view-key.ts`), com migração do localStorage antigo.
2. **Painel lateral unificado** (`DetailSidePanel`) em initiative, project e issue:
   400 px, toggle 28 × 28 persistido por tipo, Sheet mobile único; "Properties" inline
   removido do overview (só no painel, como no Linear).
3. **`right-panel-store` por rota** (Insights de uma página não vaza para outra).
4. **Preferências de layout no servidor** (`SettingsSchema.layout`): display por view,
   list/board, times expandidos, sidebar customizada, painéis de detalhe, largura do Inbox.
5. **Um motor de filtro**: views salvas convertem `ViewFilter` → `FiltersState` e passam
   por `applyIssueFilters`; a página da view mostra os chips somente leitura.
6. **Splice por entidade** (team, cycle, view, user, labels, statuses) no lugar do
   re-hydrate; ficaram com `hydrate()` só `team-members` (decisão de join-request devolve
   requests, não membros) e o health update da initiative (devolve o update, não a
   initiative).
7. **Perf miúda**: `groupByKey` linear, selectors individuais no `GroupedIssuesView`,
   `ProjectsSection` memoizado, `isDefault` do Display completo.
8. **Guide das reviews** gerado a partir do diff via Bedrock (`POST
/api/v1/reviews/{id}/guide`, persistido em `review.guide`), com "Generate"/"Regenerate"
   e mensagem honesta sem modelo configurado.
9. **PRs antigos** ganham arquivos/commits/checks sob demanda ao abrir o detalhe
   (`review.depth_synced_at`, uma tentativa por PR).

**Promovido para produção na release
[v0.25.0](https://github.com/Nimbloo/circle/releases/tag/v0.25.0)** (PRs #87 e #88):
migration 0035 aplicada no boot (36/36), rollout `Synced/Healthy`, `healthz`/`readyz` em
`200`.

**Ainda em aberto:** de-para pixel do painel de initiatives com o Linear — a extensão
Claude-in-Chrome está sem permissão para `linear.app`; liberar o domínio para medir
hover/spacing/tipografia ao vivo.

**Produção — checks dos PRs em 0/0.** O `GITHUB_TOKEN` do Secrets Manager é um PAT
fine-grained sem a permissão **Checks: Read-only** (`/check-runs` devolve 403 "Resource
not accessible by personal access token"; `/files` e `/commits` funcionam). Ajustar as
permissões do token no GitHub e rodar o sync de novo — nada a mudar no código.

**Produção — Bedrock (agent chat e Guide das reviews) fora do ar.** Toda chamada ao
modelo `us.anthropic.claude-sonnet-4-5-20250929-v1:0` devolve
`ResourceNotFoundException: Model use case details have not been submitted for this
account` — a conta AWS `967587831433` ainda não preencheu o formulário de caso de uso da
Anthropic no Bedrock (console → Bedrock → Model access → Anthropic → "Submit use case
details"). A IRSA `circle-role-nimbloo-eks` já tem `bedrock:InvokeModel` no foundation
model e nos inference profiles; é só o formulário. Efeito: `POST /api/v1/agent/chats`
responde 500 e `POST /api/v1/reviews/{id}/guide` responde 503 com mensagem honesta.
Pré-existente à v0.25.0 (o agent já falhava); nada a mudar no código.

### Produto — cycles, editor, datas de initiative, projetos (02/09/2026)

Os quatro itens que dependiam de decisão foram decididos e construídos (spec
`docs/superpowers/specs/2026-09-02-debito-2-e-produto-design.md`):

- **Cycles (#24):** `team.cycle_cooldown_days` (Team settings → Cycles), rollover cria o
  próximo cycle após o cool-down e nenhum cycle é `current` no intervalo; `cycle_snapshot`
  diário por upsert lazy (rollover no boot e GET do detalhe), `scopeDelta` e burn-up reais
  a partir do histórico. Sem CronJob.
- **Editor de blocos (#16):** Tiptap v3; `description_doc` (jsonb) em `issue_content` e
  `project_detail`; `description` continua como projeção em markdown (busca, API antiga).
  Fora: imagens/vídeo/referências de issue e o modal de criação (segue textarea).
- **Datas reais em initiatives:** `start_date`/`target_date` com backfill dos rótulos
  ("Q3 2026", "H2 2026", "2026", "Sep 2026", ISO); o rótulo `target` segue como texto humano.
- **Projetos (#19):** DnD no board por status e reschedule na timeline (arraste da barra e
  das alças, teclado ←/→ e Shift). Board por time não existe (PATCH não aceita `teamId`;
  seria mudança de contrato).

Também quitados os sete itens miúdos restantes da auditoria: código morto de reviews,
perfil de membro no `DetailSidePanel`, painel de issue no Inbox por container query, chips
em views de projeto, `decideJoinRequest`/`postInitiativeUpdate` devolvendo a entidade,
`vitest.config` com workers por CPU e timeout de 60 s, guards de `size` dinâmico e motion.

**Promovido para produção na release
[v0.26.0](https://github.com/Nimbloo/circle/releases/tag/v0.26.0)** (PRs #91 e #92):
migrations 0036–0038 aplicadas no boot (39/39, incluindo o backfill de `target_date`),
rollout `Synced/Healthy`, `healthz`/`readyz` em `200`.

### Produto — editor completo, comentários de review, board por time, épico fatiado (03/09/2026)

Restos conscientes da leva anterior, decididos e construídos (spec
`docs/superpowers/specs/2026-09-03-produto-restos-design.md`, três grupos em paralelo):

- **Editor (#16), agora completo:** imagens com upload (`POST /api/v1/uploads`, mesmo S3/CDN
  dos avatares, png/jpeg/webp/gif até 5 MB, placeholder enquanto sobe, 503 honesto sem
  bucket configurado), vídeo por URL (YouTube/Vimeo/Loom em `iframe` 16:9, `.mp4/.webm` em
  `<video>`), referência a issue com `#` (chip vivo com status e título, colar `ENG-12`
  converte só identifiers conhecidos) e os modais de criar issue/projeto usam o
  `BlockEditor` enviando `descriptionDoc`. `docToText` conhece os três nós. **CSP** ganhou
  `frame-src` dos três players e `media-src 'self' https:`.
- **Reviews (#22), comentários e veredito:** tabela `review_comment` (migration 0039),
  `GET/POST /reviews/{id}/comments` e `PATCH/DELETE .../{commentId}` (edita só o autor;
  exclui autor ou admin), evento realtime `review_comment`. UI: thread no Overview, composer
  inline por linha e por arquivo no Diff, "Approve" / "Request changes" com badge do último
  veredito no cabeçalho. Só linhas do arquivo novo são ancoráveis.
- **Projetos (#19), board por time:** `PATCH /projects/{id}` aceita `teamId` (aditivo; 400
  para time inválido; activity "changed team"; issues não mudam de time). Grouping do
  Display ganhou `status`, agora o **padrão** da lista e do board (como no Linear); o board
  solta o card por status ou por time conforme o grouping. Popover de Display cresce com o
  conteúdo (o Reset sobrepunha "Labels" na variante Timeline).
- **Épico #25 fatiado** em nove issues por tema (#94–#102), cada uma com por quê, escopo,
  fora do escopo e aceitação; o épico segue aberto só com o checklist.

Fica de fora, consciente: item "Video" do menu "/" ainda pede a URL por `window.prompt`
(UI inline depois); comentário em linha removida (`-`) não é ancorável.

**Promovido para produção na release
[v0.27.0](https://github.com/Nimbloo/circle/releases/tag/v0.27.0)** (PRs #103 e #104):
migration 0039 aplicada no boot (40/40), rollout `Synced/Healthy`, `healthz`/`readyz` em
`200`. Issue #16 fechada; #22 comentada (resta só Bedrock e PAT, que dependem de você).

### Produto — sub-issues, checklists, threads + anexos, múltiplos responsáveis, edição inline (03/09/2026)

Primeira leva do épico fatiado (#95, #98, #96) mais "tasks" e a checagem da edição inline
pedida (spec `docs/superpowers/specs/2026-09-03-sub-issues-threads-assignees-design.md`,
quatro grupos em paralelo):

- **Sub-issues (#95):** pai canônico em `issue.parent_id` (migration 0040) com backfill de
  `issue_relation kind='sub'` (0041); create com `parentId` herda time, prioridade, projeto
  e cycle ativo (labels não; assignee só se o criador é o assignee do pai); guarda de ciclo;
  mover/remover pai com activity; rollup por `GROUP BY`; delete do pai desvincula as filhas.
  Detalhe lê as filhas do servidor (fim do bug "filha fora do store some"), criar inline
  com Enter e colar N linhas, "Add existing issue" com busca, propriedade Parent,
  "Convert to sub-issue of…", breadcrumb `Team › PAI › FILHA`. "Show sub-issues" voltou ao
  Display (default ligado; sincronizado), chip do pai na linha e no card, filtro
  "Sub-issues", toggles de auto-close (pai ← filhas, filhas ← pai) em Team settings.
- **Checklists ("tasks"):** `Mod-Shift-7` alterna task list, `Alt/Mod-Enter` marca o item,
  colar markdown/Google Docs vira lista; item vira sub-issue por botão no hover ou
  `Mod-Shift-O` (chip `issueRef`, check segue o status). O Linear não tem uma feature
  "Tasks"; isso é a paridade do checklist dele.
- **Threads e anexos (#98):** respostas colapsadas ("N replies"), reply em qualquer
  comentário da thread, Resolve/Reopen (autor da raiz, assignee ou admin), "edited",
  "Convert to sub-issue", notificação dos participantes com o texto da raiz no e-mail.
  Tabela `attachment` (migration 0040) + `POST /api/v1/attachments` multipart até 25 MB com
  allow-list (sem svg/html/js), mesmo bucket/CDN em `uploads/*`; seção Attachments no
  detalhe, anexos em comentário, clipe / Ctrl+Shift+A / arrastar / colar. Sem bucket local a
  rota responde 503, como o upload do editor.
- **Múltiplos responsáveis (#96):** `issue_assignee` (0040) com backfill (0042);
  `assignees[]` no DTO (principal = `assigneeId` continua), `assigneeIds` no create/update,
  filtros e `assigneeMe` pela junção, notificação e subscribe por pessoa, activity por
  entrada/saída. Multi-select com "Assign to me", pilha de avatares (até 3 + N) em linha,
  card e propriedades; **My issues › Assigned** passou a vir do servidor e inclui
  colaboradores; CSV com `assignees`. O Linear é single-assignee por design; aqui foi
  decisão sua.
- **Edição inline nas listas (sua checagem):** confirmado o relato. Causas e correções:
  busca guardava resultados fora do store (a linha não mudava) → resolve contra o store;
  seletores de sub-issue dentro do `<Link>` navegavam → fora do link, com status editável;
  issue fora do store (deep-link, ⌘K) não persistia label/propriedade → o store chama a API
  e faz upsert; projeto e views sem Display/board/painel editável → ganham os três; menu de
  contexto mostrava 5 projetos → busca com todos; labels/projeto/estimate/cycle/due date eram
  badges estáticos → viraram seletores; reorder por arraste agora também na lista;
  `ProjectBadge` sem orgId fixo. Primeiros testes que montam a linha e disparam mutation.

Fica de fora, consciente: o `checked` de um item convertido não é regravado no doc quando
a sub-issue muda de status (o NodeView deriva do store); anexo de comentário sobe depois do
POST do comentário (falha vira toast por arquivo); `deleteIssue` não apaga objetos S3 de
anexos (cascade só no banco).

**Promovido para produção na release
[v0.28.0](https://github.com/Nimbloo/circle/releases/tag/v0.28.0)** (PRs #106 e #107):
migrations 0040–0042 aplicadas no boot (43/43), rollout `Synced/Healthy`, `healthz`/`readyz`
em `200`, upload real de anexo verificado (CDN 200 com `Content-Disposition: attachment`).
Issues #95, #98 e #96 fechadas. Próximas do épico: #94 (depende do Bedrock), #97, #99, #100,
#101, #102.

## Decisões suas (não é falta de código)

Nenhuma pendente em 02/09/2026: datas de initiatives, snapshot de cycles e editor de blocos
foram decididos e entregues (seção acima).

## Construção de produto

Roadmap, não limpeza. Priorize por valor.

| Issue                                              | O que falta de verdade                                                                                                                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#19](https://github.com/Nimbloo/circle/issues/19) | **Fechada**: DnD no board por status, reschedule na timeline e agora board por time (`teamId` no PATCH) saíram em 02–03/09; health, resources e milestones já estavam prontos.                                                                                 |
| [#22](https://github.com/Nimbloo/circle/issues/22) | Webhook, "For you/Created", arquivos/commits/diff, checks reais, **Guide narrado e comentários/veredito de review** saíram (02–03/09). Resta só o que depende de você: Bedrock (use case) e PAT com `Checks:read` para o Guide e os checks em produção.        |
| [#24](https://github.com/Nimbloo/circle/issues/24) | **Fechada na prática**: cool-down e snapshots (upsert lazy) saíram em 02/09; burn-up e scopeDelta agora vêm do histórico. Falta só fechar a issue no GitHub.                                                                                                   |
| [#16](https://github.com/Nimbloo/circle/issues/16) | **Completo**: blocos, listas, tarefas, código, links, imagens com upload, vídeo por URL, referência a issue com `#` e editor nos modais de criação. Resta polir o item "Video" do menu "/" (hoje `window.prompt`).                                             |
| [#25](https://github.com/Nimbloo/circle/issues/25) | Épico de paridade com o Linear, **fatiado em 03/09** nas issues #94–#102 (triage com IA, sub-issues, múltiplos responsáveis, SLAs/automações, threads/anexos, busca, organização, import/export/API/webhooks, roadmap). Executar pelas issues, não pelo épico. |

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
