# Pendências do Circle

Estado em **2026-09-07**, com `main` e `develop` sincronizadas na v0.32.0.

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

Fica de fora, consciente: comentário em linha removida (`-`) não é ancorável. (O item "Video"
do menu "/" pedia a URL por `window.prompt`; virou popover inline na v0.29.1.)

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

Fica de fora, consciente: anexo de comentário sobe depois do POST do comentário (falha vira
toast por arquivo). (Os outros dois desta lista — o `checked` do item convertido e o S3 órfão
no `deleteIssue` — foram corrigidos na v0.29.1.)

**Promovido para produção na release
[v0.28.0](https://github.com/Nimbloo/circle/releases/tag/v0.28.0)** (PRs #106 e #107):
migrations 0040–0042 aplicadas no boot (43/43), rollout `Synced/Healthy`, `healthz`/`readyz`
em `200`, upload real de anexo verificado (CDN 200 com `Content-Disposition: attachment`).
Issues #95, #98 e #96 fechadas. Próximas do épico: #94 (depende do Bedrock), #97, #99, #100,
#101, #102.

### Épico #25 fechado — SLAs/automações, busca, organização, API pública, roadmap, triage (04/09/2026)

Leva 2, com as seis issues restantes do épico e os restos conscientes da v0.28.0 (spec
`docs/superpowers/specs/2026-09-04-epico-25-leva-2-design.md`, seis grupos em paralelo):

- **SLAs e automações (#97):** `team_sla` por prioridade preenche `dueDate` na criação e na
  repriorização (data manual sempre vence), com indicadores "at risk"/"breached" na linha e no
  card e filtro próprio; `team_automation` com gatilhos (criada em triage, status mudou, label
  adicionada, PR mergeado) e ações (label, status, prioridade, responsável, fechar sub-issues),
  anti-loop com profundidade 3, audit e activity. Tela em Team settings → Workflows.
  O fluxo fixo "PR merged → Done" virou regra default semeada lazy.
- **Busca (#99):** colunas `search_vector` geradas (peso A no título) com índice GIN em issues,
  projetos, initiatives e documentos; `GET /api/v1/search` com ranking, snippet destacado por
  sentinela (a tag nunca vem do conteúdo) e fallback `ilike` em três casos; palette e busca
  dedicada agrupadas por tipo com chips e "Save search" virando View. Semântica por embeddings
  fica atrás de `CIRCLE_SEARCH_SEMANTIC=1` e nunca quebra o resultado léxico.
- **Organização (#100):** `team.parent_id` e `initiative.parent_id` com guarda de ciclo, sidebar
  aninhada, breadcrumb e listas do pai incluindo os filhos; rollup de sub-initiatives por
  subárvore; desativar membro (`deactivated_at`) mantém histórico, remove dos times, bloqueia o
  login com mensagem própria e some dos seletores; papel `Guest` com escopo aplicado no servidor
  em toda leitura, com um teste de autorização por rota.
- **Import/export, API pública e webhooks (#101):** import CSV com preview, mapeamento e commit
  idempotente (`issue_import`), export JSON; `api_token` com hash, prefixo e escopos, rotas
  `/api/public/v1/*` respeitando o escopo de Guest e `openapi.json`; `webhook` com assinatura
  HMAC, entrega inline e retry com backoff, mais Redeliver. Telas em Settings.
- **Roadmap (#102):** tela agrupada por initiative respeitando a hierarquia, com marcos, zoom e
  Display; `project_dependency` com guarda de ciclo, seta e alerta de atraso; `project_snapshot`
  diário por upsert lazy alimentando gráfico SVG no projeto e agregado na initiative.
- **Triage com IA (#94):** `issue_triage_suggestion` gerada ao entrar na fila e lazy no GET, com
  ancoragem de todo id no catálogo real. Sem Bedrock, cai no heurístico por similaridade de
  título e mostra só duplicatas, com mensagem honesta. Accept aplica campos, move de time e
  relaciona as duplicatas.
- **Restos da v0.28.0:** `checked` do item convertido volta a ser regravado no doc,
  `deleteIssue` limpa os objetos S3 dos anexos, e o item "Video" do editor virou popover inline.

Dois bugs de integração corrigidos aqui: um `export` extra num route handler quebrava o build de
produção, e o sweep de webhooks no boot arrastava o cliente Postgres para o bundle Edge e
derrubava toda requisição em dev (agora é lazy, no publish e na listagem de webhooks).

**Promovido para produção na release
[v0.29.0](https://github.com/Nimbloo/circle/releases/tag/v0.29.0)** (PRs #109 e #110):
migrations 0043–0045 aplicadas no boot (46/46), rollout `Synced/Healthy`, `healthz`/`readyz`
em `200`, busca full-text respondendo pelo índice (sem fallback), roadmap agrupado por
initiative e rota pública devolvendo `401` sem token. **Épico #25 fechado**, junto com #94,
#97, #99, #100, #101 e #102. Restam abertas só #22 (reviews, à espera do PAT e do Bedrock),
#27 e #28, que vivem em outro repositório.

### Auditoria da v0.29.0 e a correção de segurança (04/09/2026)

Depois de fechar o épico, uma auditoria em três frentes (autorização, integridade do merge dos
seis grupos, comportamento sob carga) **provou rodando código** 16 cenários de autorização
exploráveis por qualquer usuário autenticado, mais dois bugs que quebravam operação normal.
Corrigidos na
[v0.29.1](https://github.com/Nimbloo/circle/releases/tag/v0.29.1) (PRs #112 e #113), spec em
`docs/superpowers/specs/2026-09-04-hardening-autorizacao-design.md`.

**A causa era estrutural:** o escopo vivia nos route handlers e só nas leituras — 29 de 192
handlers verificavam, e nenhuma escrita interna. O gate passou para a **camada de serviço**, com
validação de **origem e destino** em todo movimento (era a escalação em que um convidado puxava
projeto alheio para o próprio time e passava a lê-lo, tornando decorativa a proteção de leitura).
Um teste-guarda novo falha quando uma rota de escrita nasce sem verificação.

Também entraram: desligamento que bloqueia sessão viva, Bearer e token de máquina num ponto só
(e rebaixa o papel — antes desativar **ampliava** o alcance); administrador obrigatório em token
de API e webhook; anti-SSRF com revalidação a cada disparo; duas rotas de time que respondiam sem
sessão; os dois `23503` (apagar issue importada e apagar time com automação); anexo checando
tamanho antes de materializar o corpo; SLA com hora real (1 h, 4 h e 12 h davam o mesmo prazo);
busca casando com e sem acento; automações que não derrubam a requisição nem ressuscitam;
fila de webhook destravada; gráficos sem pontos inventados; e **erros da API chegando ao
Sentry** — antes nenhum 5xx chegava, o que tornava todo o resto invisível.

**Mudança de comportamento consciente:** convidado recebe 403 onde antes recebia 200, e token e
webhook viraram exclusivos de administrador.

**Verificado em produção:** migrations 0046–0048 aplicadas no boot (49/49), rollout
`Synced/Healthy`, `healthz`/`readyz` em `200`, webhook para `169.254.169.254` recusado com 400,
busca respondendo pelo índice e `slaDueAt` no contrato.

~~Fora do repositório: conferir o valor implantado de `CIRCLE_KEYCLOAK_ALLOWED_CLIENTS`.~~
**Resolvido em 06–07/09**: a variável não existia no chart (Bearer desligado) e depois deixou de
existir no código — quem pode chamar a API virou uma decisão do Keycloak. Ver a seção abaixo.

### A busca ficou sem escopo até a v0.29.4 — e por quê (04/09/2026)

**O achado principal da auditoria passou batido em três levas.** `GET /api/v1/search` só
chamava `requireEmail`: um convidado lia título e snippet de issues, projetos, initiatives e
documentos do workspace inteiro, e com `?teamId=` o vazamento ficava **dirigido** ao time
proibido.

Causa da falha de processo, registrada para não repetir: o gate foi distribuído por
**propriedade de arquivo**, e `lib/api/search.ts` estava com o grupo que cuidava de acento e
ranking, enquanto as rotas de escopo estavam com outro grupo. Ninguém era dono do cruzamento.
Pior: as verificações seguintes checaram **amostras** de rota, não todas — e o guarda
automático só cobre ESCRITA, então a leitura não acusa.

Corrigido: `SearchOptions.teamIds` aplicado nas quatro consultas indexadas e nas do fallback;
initiative (que não tem time) segue a regra da listagem — só aparece se agrega projeto de time
visível. A fila de triagem por time tinha o mesmo furo e entrou junto.

**Regra que fica:** ao fechar auditoria, varrer **todas** as rotas (`git ls-files app/api/v1`)
e conferir handler **ou** serviço, em vez de amostrar; e nunca declarar um achado fechado sem
executar a checagem contra o código.

### Escopo nas LEITURAS e integridade entre times (04/09/2026)

Terceira passada: o hardening e os resíduos cobriram escrita e alguns detalhes, mas sete
**leituras** continuavam só exigindo sessão. Fechadas:

- **Documentos, membros e cycles por time.** O documento tinha gate na escrita
  (`assertTeamMember`) e nenhum na leitura; membros permitia enumerar quem trabalha onde. O
  pior era o GET de cycles: ele **dispara o rollover**, então um convidado fechava cycles e
  migrava issues de um time que nem enxerga. O escopo agora vem ANTES do rollover.
- **View e cycle por id direto.** A listagem filtrava, o acesso por id não.
- **Favoritos.** A linha é do usuário, mas o resolve devolvia título e identifier da
  entidade; entidade fora do escopo agora some da lista, como já acontecia com apagada.
- **Integridade cruzada:** cycle de outro time era aceito na issue (sujava burn-up e fila do
  time dono) e usuário desativado ainda podia receber atribuição pela API — o motor de
  automação validava, criar/editar issue não.

Seis testes novos, todos falhando antes. O guarda de escrita não pega leitura: por isso estes
casos entraram explícitos em `test/guest-scope.test.ts`.

### Resíduos do hardening, fechados (04/09/2026)

Uma segunda passada depois da v0.29.1 achou débito remanescente do mesmo tipo, agora corrigido:

- **Anexar arquivo não verificava escopo** — o serviço checava só a existência da issue, então
  um convidado anexava em issue de time que não enxerga. Pior: a rota estava na lista de
  exceções do guarda de escrita, rotulada como "dado do próprio usuário". A verificação passou
  para o **topo** da função (autorização antes de disponibilidade: o 503 de storage vinha
  primeiro e confirmava a existência da issue).
- **Stream de eventos sem escopo** — o barramento é global e o evento não carrega o time. Para
  escopo restrito o corte é a **redação**: convidado recebe `entity`/`action` (suficiente para
  refazer as listas dele) e nunca `id` nem `actorEmail`.
- **Agente de IA sem escopo** — as ferramentas de listar time, issue e cycle passavam filtro
  vazio; agora herdam o escopo do usuário. As de escrita já passavam pelo gate dos serviços.
- **Exceções vencidas do guarda** — token de API, webhook, membro e convite estavam na lista
  como "fora do Grupo 1", mas foram fechados na mesma release. Removidas: o guarda passa sem
  elas, o que prova que o gate existe, e volta a acusar se alguém tirar.
- Código morto removido (`snapshotAllProjects`) e três notas de "fica de fora" que descreviam
  itens já corrigidos.

### Acesso de máquina inteiro no Keycloak (06–07/09/2026, v0.31.0 e v0.32.0)

A API pública nasceu com cofre próprio: o Circle emitia `circle_<hex>`, guardava o hash e
uma tela de Settings criava e revogava. Isso é um segundo lugar para dar e tirar acesso —
o oposto de SSO total. A credencial agora é o access token de um **service account do
realm**, e quem dá e tira é o Keycloak (ver `docs/BACKEND_DESIGN.md`, seção 2).

O que ficou de rastro, de propósito:

- **A tabela `api_token` continua no banco.** Migration que apaga dado não entra (regra do
  projeto), então ela segue declarada em `db/schema.ts` marcada como aposentada, sem
  nenhum código lendo ou escrevendo. Um token `circle_…` não autentica mais nada. Remover
  a tabela é uma limpeza futura, para quando o histórico não interessar mais.
- **Não existe credencial read-only.** A permissão de uma máquina é a do papel dela, igual
  à de uma pessoa. Se um dia for preciso um robô que só lê, o caminho é um papel novo no
  realm (o `Viewer` do Grafana é o precedente), não um escopo de API inventado aqui.
- **Não existe variável listando quem pode chamar.** A primeira versão desta migração
  tinha uma (`CIRCLE_KEYCLOAK_ALLOWED_CLIENTS`), e ela era o mesmo defeito do cofre: um
  segundo lugar para conceder acesso, com deploy no meio. Saiu na v0.32.0. O corte passou
  a ser: token de service account somado à client role de `circle` — dois fatos do IdP.
  Abrir para um robô = criar o client com service account e atribuir a role; fechar =
  revogar a role.
- **Por que não bastou validar a audiência:** `grafana` e `kiali` emitem token com escopo
  completo, então o token de uma pessoa logada no Grafana carrega as roles do Circle e,
  por tabela, a audiência do Circle. O corte por service account não depende de como os
  outros clients estão configurados. Se um dia esses clients passarem a ter escopo
  fechado, validar audiência vira uma segunda barreira barata.

### Lentidão: o que foi medido, o que foi corrigido, o que sobrou (07/09/2026)

Investigação com dados, não com impressão: banco de teste com 2.000 e 10.000 issues,
medição de query por chamada, peso de payload por campo, e a cascata real no navegador.

**O que NÃO era o problema** (medido, para não gastar esforço de novo):

- **Banco.** `listIssues` faz 6 queries por página, constante — sem N+1. O keyset por
  `rank` usa `idx_issue_rank` (index scan, 0,1 ms). Com 10.000 issues, cada página custa
  12 ms. `bootstrapWorkspace` = 40 queries em 84 ms; detalhe de issue, 7 queries em 3 ms.
- **Renderização da lista.** Já é virtualizada: 2.000 issues viram ~2.000 nós de DOM com
  40 linhas montadas. Os stores usam seletores, não assinam o objeto inteiro.
- **Pipeline no cliente.** `JSON.parse` de 2,3 MB = 6 ms; `adaptIssues` = 2 ms.
- **CPU do pod.** 5 m em uso, nó a 3%. Não havia contenção.

**O que era** (e foi corrigido nesta release):

1. **Resposta de API sem compressão.** O Next comprime HTML e assets, mas não o que sai de
   route handler — confirmado no build de produção (`/login` gzip, `/api/metrics` cru). O
   hydrate do board mandava **2.283 KB** de JSON cru. Com gzip no `handle()`: **106 KB**
   (21x), 0,9 ms de CPU por resposta. Verificado na ponta: 233.746 -> 12.870 bytes.
2. **Dez idas ao servidor, em sequência.** Paginação keyset com teto de 200 por página.
   Medido no navegador: 10 requisições encadeadas, ~7,7 s de espera. Teto para 1.000:
   **2 requisições**. Ponta a ponta, na mesma tela: **2.354 KB -> 118 KB**.
3. **Métrica cega.** `http_request_duration_seconds` não tinha rótulo de rota, então dizia
   'algo entre 30 ms e 245 ms' sem apontar onde. Agora tem `route`, com identificadores
   normalizados para `:id` (conjunto fechado; `routePattern` tem teste).

**Hipótese que os dados derrubaram:** o editor (Tiptap) entra pelo sidebar, que vive no
layout, então parecia estar no primeiro carregamento de toda página. Carregá-lo sob demanda
**não mudou nada** (±1 kB em todas as rotas) — o Next já resolvia isso. A mudança foi
revertida em vez de ficar como complexidade sem ganho.

**Terceira medição — interação (07/09, noite):** faltava responder se a INTERAÇÃO travava,
que era a pergunta original ("fluida"). Medido com as funções reais do app sobre 2.000
issues: `adaptIssues` 0,90 ms · `groupIssuesByStatus` 0,10 ms · ordenar por rank 0,34 ms ·
por título 1,79 ms · por data 1,66 ms · filtrar por texto (cada tecla na busca) 0,24 ms ·
splice de uma issue no update otimista 0,08 ms. **Tudo abaixo de um frame (16 ms).** Não há
jank de processamento: o custo de uma interação é o React redesenhar ~40 linhas
virtualizadas. Não otimizar nada aqui sem um sintoma novo.

**Segunda rodada, no bundle (07/09, tarde):**

Com `@next/bundle-analyzer` instalado (`ANALYZE=true pnpm build`, que escreve em
`.next-analyze/` para não atropelar um `next dev` em uso), o mapa mostrou onde o peso
estava de verdade: **recharts, 357 KB**, entrando no primeiro carregamento de sete telas
porque o painel de insights e o gráfico de burn-up eram importados de forma estática — o
`all-issues` já os carregava sob demanda, os outros não. Corrigido, com medição:

| rota                                   | antes        | depois     |
| -------------------------------------- | ------------ | ---------- |
| `project/[id]/overview`                | 561 kB       | **462 kB** |
| `team/[id]/cycle/active` e `/upcoming` | 549 kB       | **440 kB** |
| `profiles/[memberId]`                  | 542 kB       | **442 kB** |
| `project/[id]/issues`                  | 541 kB       | **442 kB** |
| `view/[viewId]`                        | 540 kB       | **441 kB** |
| `team/[id]/cycles`                     | com recharts | **280 kB** |

Recharts não está mais no primeiro carregamento de nenhuma rota. A legenda do burn-up
virou módulo próprio (`cycle-progress-legend.tsx`): ela não usa recharts, mas morava no
mesmo arquivo do gráfico, então quem só queria a legenda pagava a biblioteca inteira.

Também saiu o `SessionProvider` do NextAuth: **nada no app consome `useSession`** (a
identidade vem do `me` do bootstrap), e ele fazia um GET `/api/auth/session` por carga de
página, mais um a cada foco da janela, para um dado que ninguém lia. `signOut` não depende
dele — confirmado no código do pacote instalado.

**Duas hipóteses derrubadas pela medição, nesta ordem:** carregar o editor sob demanda
(±1 kB — o Next já o separava num chunk assíncrono) e as exclusões de Replay/debug do
Sentry (`bundleSizeOptimizations`: 4443 KB antes e depois). As duas foram revertidas.
O Sentry ocupa ~309 KB nos chunks sempre carregados e não há botão oficial que corte isso
sem desligar o tracing, que está em uso.

**O que sobrou, com número:**

- **O cliente ainda baixa TODAS as issues do workspace.** Com 2.000, são 2 requisições e
  118 KB; com 10.000, viram 10 requisições e ~530 KB comprimidos — cresce linear, para
  sempre, e acontece a cada carga de página. O caminho é carregar o que a view precisa
  (filtro no servidor + paginação por scroll), tratando o store como cache. É refatoração
  de verdade, não ajuste: precisa de decisão antes.
- **JS por rota entre 483 e 562 kB** (gzip) nas telas pesadas, com 188 kB de shared. É
  custo de primeira visita (cache imutável de 1 ano cobre o resto). Para atacar com método,
  falta um `@next/bundle-analyzer` — sem ele é chute.
- **Infra:** 1 réplica com `requests.cpu: 50m`. O barramento de eventos já é cross-pod
  (LISTEN/NOTIFY) e as migrations têm advisory lock, então subir para 2 réplicas é seguro
  quando fizer sentido; hoje não há contenção que justifique.

### Auditoria de tempo real e sanidade (08/09/2026)

Varredura das 84 rotas de escrita seguindo a cadeia de imports (não só o import direto,
que dava falso negativo em `import.ts` e na integração do Sentry — as duas publicam via
`createIssue`).

**Corrigido nesta rodada:**

- **Status não publicava evento.** São as COLUNAS do board: um admin mudava o workflow do
  time e todo mundo seguia com as colunas velhas até dar refresh. Idem templates, SLA e
  emoji. Entrou a entidade `catalog`, que o cliente responde re-hidratando o workspace.
- **Editar o próprio perfil não avisava ninguém.** Nome e avatar aparecem em autoria e
  atribuição na tela dos outros; agora publica `member`.
- **O stream aceitava conta desativada.** `GET /api/v1/events` é a única rota que não passa
  pelo `handle`/`requireEmail`, e usava só `emailFromRequest` — que não checa desativação.
  Era a última porta aberta de quem foi desligado. Agora checa na abertura e reconfere a
  cada ~5 min no heartbeat (o stream vive horas; checar uma vez não basta).
- **Aba escondida segurava conexão para sempre.** Ver o item de HTTP/1.1 abaixo.
- **Reconexão sem backoff.** Era 1 s fixo: no deploy, todo cliente voltava em uníssono
  contra o pod que acabou de subir. Agora é exponencial com jitter, teto de 30 s.

**Achado de infraestrutura, não corrigido aqui:** `circle.nimbloo.ai` serve **HTTP/1.1**
(medido no navegador, `nextHopProtocol` — o `curl` desta máquina não fala HTTP/2 e deu
falso negativo antes). Em HTTP/1.1 o browser permite ~6 conexões por origem, e o SSE segura
uma delas permanentemente: **com 6 abas do Circle abertas, o app trava esperando conexão**.
O cliente agora solta o stream em aba escondida, o que mitiga, mas a correção de fundo é
ligar **HTTP/2 no gateway Istio** — aí o limite vira streams multiplexados. Vale para todos
os serviços atrás do mesmo gateway, então é decisão de infraestrutura.

**~~Lacuna da lista de reviews~~ — fechada na sequência (v0.37.0):** ela buscava no mount e
não escutava evento; só o DETALHE reagia, e só a comentário. Entrou a entidade `review`,
publicada no webhook de PR (por review) e no sync do GitHub (uma vez, e só quando o sync
mudou algo). A lista escuta o mesmo evento de janela do detalhe, com refetch silencioso.

**Falha de método da própria auditoria, corrigida depois (v0.38.0):** a varredura inicial foi
por ROTA, e rota não enxerga serviço que ela não importa direto. Revarrendo por SERVIÇO
apareceram dois casos da mesma família já corrigida — `avatar.ts` (a foto aparece na autoria
alheia; o publish tinha entrado só no `updateProfile`) e `project-templates.ts` (corrigi o
`templates.ts` de issue sem notar que template de projeto é outro arquivo). Ficam sem evento
de propósito: favoritos e convites (por usuário / tela de admin), webhooks (config de admin)
e `s3-assets` (utilitário) — nenhum tem consumidor escutando, e publicar sem consumidor é
ruído.

**Conferido e sem problema:** toast de sucesso só depois da confirmação da API (com rollback
no catch) em todos os stores; o log estruturado não carrega corpo nem query string; as rotas
sem Zod são as sem corpo (`read-all`, `dismiss`, `redeliver`, `sync`).

## Decisões suas (não é falta de código)

**Alerting e observabilidade de infra ficam por último (decidido em 08/09/2026).** O Circle é
ferramenta INTERNA — a indisponibilidade custa incômodo, não receita. Vale para: as três chaves
de webhook do Slack no Secrets Manager (que destravariam o `nimbloo-k8s#523` e fariam o
Alertmanager entregar alerta em algum lugar), o DSN do Sentry, o tracing para o Tempo (issue
#28) e a imagem ARM (issue #27). Não reabrir como "débito urgente" — é prioridade consciente,
não esquecimento.

Fora isso, nenhuma decisão pendente em 02/09/2026: datas de initiatives, snapshot de cycles e
editor de blocos foram decididos e entregues (seção acima).

## Construção de produto

Roadmap, não limpeza. Priorize por valor.

| Issue                                              | O que falta de verdade                                                                                                                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#19](https://github.com/Nimbloo/circle/issues/19) | **Fechada**: DnD no board por status, reschedule na timeline e agora board por time (`teamId` no PATCH) saíram em 02–03/09; health, resources e milestones já estavam prontos.                                                                                 |
| [#22](https://github.com/Nimbloo/circle/issues/22) | Webhook, "For you/Created", arquivos/commits/diff, checks reais, **Guide narrado e comentários/veredito de review** saíram (02–03/09). Resta só o que depende de você: Bedrock (use case) e PAT com `Checks:read` para o Guide e os checks em produção.        |
| [#24](https://github.com/Nimbloo/circle/issues/24) | **Fechada na prática**: cool-down e snapshots (upsert lazy) saíram em 02/09; burn-up e scopeDelta agora vêm do histórico. Falta só fechar a issue no GitHub.                                                                                                   |
| [#16](https://github.com/Nimbloo/circle/issues/16) | **Completo**: blocos, listas, tarefas, código, links, imagens com upload, vídeo por URL, referência a issue com `#` e editor nos modais de criação. Fechada; o item "Video" virou popover inline na v0.29.1.                                                   |
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
