# Sanidade 3 — correção de todos os achados — Implementation Plan

> **For agentic workers:** execute a SUA frente task a task, no worktree indicado. Steps usam checkbox (`- [ ]`).

## Estado (handoff entre agentes)

- **Onde:** branch `danilo/sanity-audit-3` (de `danilo/sanity-audit-2` @ `87350c1`, PR #170 ainda aberto). Frentes em worktrees próprios, integradas nesta branch.
- **Feito:** todas as frentes integradas nesta branch: F5a `1ac48f9` → F5b `c6c2da6` → F1 `4ea865d` → F3 `7f80a37` → F2 `719c828` → F4 `978560c`.
   - **Migration:** `0050_wealthy_sway` regenerada pelo `drizzle-kit`, com snapshot. Inclui o `import_job` da F4, rank `text`, índices de ciclo current e de `review.created_at`, e os passos de dados do Codex (normalização de rank, encerramento de ciclos current duplicados). `db:generate` confirma que não há mudança pendente.
   - **Ajustes do integrador:**
      - F5a sem `search_vector` no `schema.ts`, e o rebalanceamento feito num UPDATE só;
      - eco do detalhe da issue pelo `own` (clientId), não mais pelo `actorEmail`;
      - `labelColor` nas telas de issues, projetos e command palette;
      - testes das frentes migrados do mock de `data/` para o `catalog-fixture`;
      - `Progress` inline no import, porque o primitivo foi removido.
- **Crash (2026-09-18 ~22h):** a sessão caiu com F1–F4 e F5b em andamento; elas foram relançadas retomando dos commits de cada worktree. O agente da F4 parou de novo, por limite de uso, e o restante da F4 foi relançado no worktree `s3-f4`, avançado até `978560c`:
   - #24, Ad#5, Ad#22, Ad#25–28, Ad#30, Ad#32–38 e Ad#40;
   - `labelColor` em members/settings/views.
- **Última verificação:** 2026-09-18, Claude: testes de cada frente verdes após cada merge; typecheck e lint limpos. Suíte completa em andamento.
- **Próximo passo:** suíte completa → merge do restante da F4 → `pnpm build` → remedição → PR.
- **Pendências registradas:**
   - busca em comentários sem índice trigram (Co);
   - "hoje" do servidor fixo em `America/Sao_Paulo` via `CIRCLE_TIME_ZONE` (não há fuso por workspace);
   - #30 bulk sem endpoint de lote.
- **Bloqueios:** nenhum.

**Goal:** resolver todos os achados da rodada 3 (alta, média, baixa e refactorings) sem regressão e com ganho medido.

**Spec:** `docs/superpowers/specs/2026-09-18-sanity-audit-3-findings.md` (`#N` = numeração de lá; `Is#/Pl#/Co#/Ad#/If#` = baixas citadas na seção "Baixa").

## Decisões do usuário (2026-09-18)

- **#52 Papel:** o Keycloak/Orbis é a **fonte única**. A UI do Circle deixa de editar papel: mostra o papel como somente leitura, com dica de onde alterar. A rota de alteração de papel responde 409/403 explicando que o papel vem do Keycloak (break-glass `CIRCLE_ADMIN_EMAILS` continua).
- **#10 Import:** vira **job em background**. `POST /import/commit` devolve `{ jobId }` na hora; o job roda no servidor (tabela de jobs, progresso, resultado, erro), `GET /import/jobs/:id` consulta e um evento SSE avisa o dono. A tela acompanha o progresso. Durante o job: sem SSE por linha, sem Slack/automações/triagem por IA por linha; webhooks `issue.created` continuam por issue; um evento coarse SSE (sem webhook) no fim.
- **#15 Settings:** **PATCH por seção** com merge no servidor; o PUT do blob continua aceito. O cliente só grava depois de um GET bem-sucedido.
- **#1 Rank:** coluna `rank` vira **`text`**; **rebalanceamento** por time reescreve ranks longos (na migration e quando um rank passar de N caracteres, ex.: 32). Continua LexoRank; formato visto pela API não muda.

## Global Constraints

- Contexto pt-BR, código em inglês. Conventional Commits em pt-BR, sem emoji, **sem mencionar IA/assistente**, sem `Co-Authored-By`. Nunca commitar `CIRCLE_DEV_AUTH_EMAIL`.
- Correção de comportamento começa com **teste que falha** (`test/`, Vitest + PGlite; UI com jsdom + Testing Library + `import './setup-dom'`).
- Camadas: UI → `lib/client.ts` → `app/api/v1` → `lib/api` → `db`. Cores só por token. Idioma da UI como está (textos novos no idioma da tela).
- Contratos: só as mudanças decididas acima; o resto aditivo/retrocompatível.
- **Migrations: só a frente F5a** gera (`pnpm db:generate`, aditivas; conversão de rank sem perda).
- Não rodar `pnpm build`/`pnpm dev`/suíte inteira; testes específicos + `pnpm typecheck` + `pnpm lint` ao fim da frente.
- Publish de SSE depois do commit; eventos novos com `teamId` quando houver.

## Frentes

### F1 — Issues (Claude) · worktree `.claude/worktrees/s3-f1`

Arquivos: `components/common/issues/**`, `components/layout/sidebar/create-new-issue/**`, `components/layout/headers/issue/**`, `components/layout/headers/issues/**`, `components/layout/headers/display-options.tsx`, `components/common/my-issues/**`, `components/layout/headers/my-issues/**`, `store/issues-store.ts` (só `rankBetween` defensivo), `store/bulk-selection-store.ts`, `lib/api/issues.ts` (só #20 e Is#21).

- [x] #2 `IssueGrid` com `memo` e props estáveis; medir com teste de render (card não re-renderiza em mudança de outra issue).
- [x] #3 + Is#15 `getItemKey` por id (linha e coluna do board).
- [x] #4 + Is#16 + R2 `useIssueDropTarget` ciente de grouping/ordering: reorder só com ordering `manual` (arrastar em outra ordenação troca para manual, como o Linear); drop entre grupos altera o campo do agrupamento (status/priority/assignee/project/label) ou é recusado; `rankBetween` nunca lança; coluna vazia aceita drop.
- [x] #26 `IssueDetailView` com `key={issue.id}`; Is#22 erro com retry.
- [x] #27 reação/edição/resolve de comentário otimistas; recarregar só a activity; ignorar o eco da própria ação (usar `clientId` de F5b se existir, senão `actorEmail`).
- [x] #29 My issues > Assigned derivado do store (`assignees` já vêm no DTO).
- [x] #30 bulk: um toast agregado, seleção podada quando issue some/esconde, popovers fecham, sem desativados; usar endpoint de lote se F4/F5a criar (não criar aqui).
- [x] #31 + R1 seletores únicos de status/prioridade/label (unificar `common/issues/*` e `create-new-issue/*`) com `keywords={[name]}`.
- [x] #32 seletor de projeto filtra pelo time da issue/modal.
- [x] #33 anterior/próxima segue a lista de origem (store de navegação com a ordem visível); J/K na lista e no detalhe.
- [x] R7 menu de contexto único no nível da lista.
- [x] Baixas: Is#13 (toast só após API; catch nas promises), Is#17 (status default = 1º unstarted; ⌘Enter; rascunho preservado ao fechar; sem link para identifier otimista), Is#18, Is#19/Ad#15 (saved search com loading/erro/reação a eventos), Is#20 (validar `labelIds` e label exclusiva no create), Is#21 (delete avisa relacionadas), Me (`aria-label` no botão Display).

**Estado F1 (2026-09-18, claude):** todas as tasks entregues na branch `danilo/s3-f1` (worktree `.claude/worktrees/s3-f1`). Última verificação: 23 arquivos de teste da frente (85 testes) verdes, `pnpm typecheck` e `pnpm lint` limpos. Fora da posse: `components/common/views/view-details.tsx` (Is#19/Ad#15, dono F4), `lib/adapters-issue-detail.ts` (1 linha, #27, dono F5b) e `store/issues-store.ts` além do `rankBetween` (id único `ISSUE_MUTATION_TOAST` no toast de erro, #30, dono F5b); `store/issue-navigation-store.ts` é novo (#33). #27 usa `actorEmail` para ignorar o eco (trocar pelo `clientId` da F5b na integração, se existir). #30 sem endpoint de lote (não criado aqui).

### F2 — Planejamento (Claude) · worktree `.claude/worktrees/s3-f2`

Arquivos: `components/common/{projects,initiatives,roadmap,cycles}/**`, `app/[orgId]/project/**`, `lib/api/{projects,project-detail,project-dependencies,initiatives,initiative-detail,roadmap,cycles,project-snapshots}.ts`, rotas `app/api/v1/{projects,initiatives,roadmap,cycles}/**`, `store/{project-updates,roadmap-display,projects-display,initiatives-display}-store.ts`.

- [x] #5 `PropertyButton` com `forwardRef` + props; R3-Pl pickers de initiative extraídos + `useInitiativePatch` otimista; #46 PATCHs serializados.
- [x] #34 overview: erro na 1ª carga → `ErrorState`, editor não monta.
- [x] #35 impedir dois ciclos `current` (409 ou rebaixar o anterior na transação); índice parcial fica com F5a.
- [x] #36 bootstrap de cycles agregado no SQL; items/snapshots só do current; upsert de `cycle_snapshot` com `IS DISTINCT FROM` e fora do GET.
- [x] #37 adicionar projeto à initiative remove vínculo antigo + publica eventos.
- [x] #38 diálogo de ciclo semeia só ao abrir.
- [x] #39 teclado do roadmap/timeline: rascunho + 1 commit (R5).
- [x] #40 roadmap: live reload com debounce, sequência, `ErrorState`; snapshot fora do GET.
- [x] #41 função única de "projeto concluído" no servidor, usada por lista/detalhe/roadmap; rollups de initiative publicados.
- [x] #42 criar projeto com compensação (sem duplicar).
- [x] #43 board de projetos: `canDrop` falso quando 409 esperado; mensagem do `ApiError`.
- [x] #44 datas com `parseISO`.
- [x] #45 + R4 + R5 `useProjectDetail(projectId)` em `app/[orgId]/project/[projectId]/layout.tsx` (loading/ready/error, seq, live reload, preserva no erro) compartilhado por overview/issues/activity e peek; `resyncAll` dispara eventos de janela (coordenar com F5b: F5b adiciona o dispatch).
- [x] #18 (projeto) descrição do projeto com concorrência otimista (`descriptionVersion`, igual à issue).
- [x] Baixas Pl#17–22 (dependência com lock, updates em transação + limite, `getUpcomingCycle`, teclado/forms nos diálogos, toggles mortos do display, `teamDescendantIds` 1×, PATCH redundante no picker, status da linha pós-erro, breakdown por todas as labels, recharts sob demanda, foco da timeline, foco nos pontos do chart, lista de initiatives O(I×P), "hoje" em UTC).

### F3 — Comunicação e ferramentas (Claude) · worktree `.claude/worktrees/s3-f3`

Arquivos: `components/common/{reviews,inbox,agent,search}/**`, `app/[orgId]/{review,reviews,inbox,agent}/**`, `components/layout/command-palette*.tsx`, `components/layout/keyboard-shortcuts.tsx`, `components/layout/sidebar/nav-inbox.tsx`, `components/common/issues/triage/**`, `lib/api/{reviews,review-*,notifications,notify,agent,triage,favorites}*.ts`, `lib/diff-patch.ts`, `store/{notifications,agent-chat,favorites,recents,inbox-layout}-store.ts`.

- [x] #8 + R5 layout de reviews com lista persistente; seção fora do segmento que remonta; `listTab` na URL.
- [x] #9 automação `pr.merged` só na transição para merged; publicar `issue` só quando o link mudar; Co#18 link por `(issue, repo, prNumber)`; Co#19 responder rápido e guardar ordem por `updated_at`.
- [x] #47 diff: memo por patch, `memo(DiffView)`, comentários agrupados por path, `content-visibility:auto`/colapso de arquivos grandes.
- [x] #48 reviews: debounce, recarregar com `limit = carregados`, ignorar eco próprio no detalhe.
- [x] #49 Slack: uma mensagem por evento (não por destinatário), sem "você" ambíguo.
- [x] #50 agent: gravar par user/assistant só no sucesso (ou fundir turnos), histórico com teto; hydrate mescla sem apagar chat em voo; loading ao abrir chat; Co#11 revelar resposta de uma vez (sem digitação simulada lenta).
- [x] #51 command palette: corpo montado só aberto; recentes em hook separado; AbortController e descarte de resultado de query antiga; "copy branch name" do usuário atual.
- [x] #19 inbox: evento com `{id, read, snoozedUntil}` aplicado como patch (sem hydrate completo) — coordenar formato com F5b/F4 (`lib/api/notifications.ts` é seu); linha renderizada do `dto.issue` (não descartar notificação de issue fora do store); "Mark all as read" por `unreadCount`; hidratar inbox em paralelo às issues (coordenar `data-hydrator` com F5b).
- [x] #28 triagem: fila filtra por ids/time, card não re-hidrata em edição, duplicatas em lote (sem N+1); Co#16 accept em transação com `UPDATE … WHERE applied_at IS NULL`.
- [x] Baixas Co#12–25 (busca em comentários fica com a F5a: `lib/api/search.ts` + índice trigram) (snooze, teclado no inbox + j/k, filtro de tipos reais, contagem de reviews pendentes e atualizada, filtro de reviews no servidor + índice (pedir índice à F5a), guia com dedupe e evento, checkbox Reviewed ou remover, favoritos/recentes por org+usuário e com evento, atalhos inativos com dialog/menu aberto, busca em comentários — pedir índice trigram à F5a), `relativeTime` único com tick, código morto do agent, `listReviews` sem ternário duplicado.

### F4 — Administração, acesso e conteúdo (Claude) · worktree `.claude/worktrees/s3-f4`

Arquivos: `components/common/{teams,members,views,settings}/**`, `app/[orgId]/settings/**`, `app/invite/**`, `app/login/**`, `app/[orgId]/page.tsx`, `lib/api/{teams,members,users,invites,views,settings,import,export,webhooks,templates,emojis,slas,documents,automations,audit,integrations/*}.ts`, rotas correspondentes, `auth.ts`, `auth.config.ts`, `middleware.ts`, `lib/client.ts` (401 + R5 parse único), `lib/user-settings-sync.ts`, `store/*filter-store.ts`.

- [x] #6 + R6 `ViewFilterSchema` único (POST/PATCH) com teste pela rota.
- [x] #7 + R6 rotas de membros de time devolvem `MemberDto` completo; teste pelo payload da rota.
- [x] #10 import como job (decisão): tabela de jobs (pedir à F5a na migration — descreva as colunas no relatório e crie o schema em `db/schema.ts` coordenando com F5a: **F4 escreve o bloco da tabela `import_job` em `db/schema.ts`; F5a gera a migration única no fim**), progresso, `GET /import/jobs/:id`, evento SSE ao dono, UI com progresso; #24 `externalId` duplicado no CSV rejeitado antes; #21 coarse sem webhook (usar canal SSE-only de F5b/F5a: `publishInternal` — se não existir, crie em `lib/api/events.ts` e registre); pular Slack/automações/triagem por linha.
- [x] #12 401 → redirect `/login?callbackUrl=` no client (parse único R5) e SSE para de reconectar; middleware anexa `callbackUrl`; 403 de conta desativada vira tela própria.
- [x] #13 escopo do SSE re-resolvido na revalidação e em evento `member`/`team` do próprio usuário (fechar stream para reconectar); cliente hidrata issues quando `me.teamIds` muda (coordenar com F5b).
- [x] #15 settings: `PATCH /settings` por seção com merge no servidor (PUT continua); cliente só grava após GET ok, manda só a seção alterada; Ad#5 tema importado validado antes de aplicar; erro de sync exposto.
- [x] #20 `GET /issues/:id/subscription` com checagem de escopo (arquivo `app/api/v1/issues/[id]/subscription/route.ts`).
- [x] #22 atribuir issue avisa a aba do responsável (evento de assinatura pós-commit) — helper único usado por create/assign/import (arquivo `lib/api/issues.ts`, hunk pequeno).
- [x] #52 papel somente leitura na UI + rota recusa alteração explicando a fonte (decisão).
- [x] #53 evento `catalog` com `kind` (template/emoji/sla/status…): cliente só re-hidrata o bootstrap quando o dado está nele; cache de emojis invalida por evento e não cacheia falha.
- [x] #54 + R6 nada de valor de `lib/api/*` importado em componente (`ApiError` do client); regra `no-restricted-imports` no ESLint.
- [x] #55 sweep de webhooks também por timer por pod.
- [x] #57 templates com seq/loading/erro (R4 `useAsyncResource`), sem resposta trocada.
- [x] #58 documentos com `teamId` no evento; overview do time escuta `DOCUMENT_CHANGED`; join requests ao vivo.
- [x] #59 `deleteTeam` em transação, tratando templates.
- [x] #38 (admin) `EditTeamDialog` e Edit de view semeiam só ao abrir.
- [x] Baixas Ad#21–40 e R8 (tooltips mortos, `byStatus` do pulse).

**Estado F4 (2026-09-18, claude):** todas as tasks entregues na branch `danilo/s3-f4` (worktree `.claude/worktrees/s3-f4`). #24 e Ad#5 já estavam resolvidos (validação no `prepareImport`/`validateImportCsv` e `parseImportedTheme`); SidebarTrigger já em `lg:hidden`. Última verificação: 24 arquivos de teste da frente (141 testes) verdes, `pnpm typecheck` e `pnpm lint` limpos. **Ad#40** só registrado: `circle.nimbloo.ai` está no `gateway-interno` (VPN-only) e o host público `circle-sentry` roteia só os paths exatos do Sentry, então `/api/metrics` não sai para a internet; qualquer um na VPN lê métricas técnicas (RED + process, sem PII). Endurecer, se desejado, no `nimbloo-k8s` (VirtualService devolvendo 404 para `/api/metrics` no host do app, com o ServiceMonitor raspando o Service direto) — sem mudança no app.

### F5a — Banco e servidor transversal (Codex) · worktree `C:/Projetos/.codex-worktrees/circle-s3-f5a`

Arquivos: `db/schema.ts` (exceto o bloco `import_job` da F4), `db/migrations/**` (ÚNICA frente que gera), `lib/api/rank.ts`, `lib/api/issues.ts` (#25 e rank), `lib/api/workspace.ts` (#23), `lib/api/http.ts`/`response.ts`/`errors.ts` (If#18), publishes sem `teamId` em `lib/api/{automations,triage,attachments,project-detail,projects,teams}.ts` (só adicionar o campo), `lib/api/search.ts`, `next.config.ts`, `instrumentation.ts`, `db/seed-catalogs.ts`.

- [ ] #1 rank: coluna `text`; `rebalanceTeamRanks(teamId)` reescreve ranks longos (limite configurável, ex. 32) em transação com lock; chamado na migration (ou script de boot idempotente) e quando create/reorder gerar rank acima do limite; publish coarse do time após rebalancear. Teste: 3.000 creates + 100 moves-to-top nunca passam do limite.
- [ ] #25 `updateIssue` lê `prev` com `SELECT … FOR UPDATE` dentro da transação e calcula diffs lá.
- [ ] #23 guarda diária liberada se o snapshot falhar (claims separadas).
- [ ] #35 índice único parcial `cycle(team_id) WHERE status='current'` (após limpar duplicados na migration).
- [ ] If#12 seed de catálogo só com tabela vazia (não ressuscitar excluídos).
- [ ] If#18 `SyntaxError` → 400; `titleFor` cobre 413; `requestId` como extension do ProblemDetail.
- [ ] If#20 `teamId` nos publishes listados.
- [ ] If#21 índices redundantes removidos, `search_vector`/GIN declarados no `schema.ts` (sem mudar o banco), índices pedidos por F3 (reviews `created_at`, trigram de comentários se aprovado — usar `pg_trgm` só se já disponível; senão registrar).
- [ ] If#22 `next.config.ts` sem pacotes inexistentes; testes com sleep fixo trocados por espera determinística.
- [ ] Migration única no fim, incluindo o bloco `import_job` que a F4 escreveu no `schema.ts` (rebase no fim: o integrador avisa).

### F5b — Infra do cliente e refactorings (Claude) · worktree `.claude/worktrees/s3-f5b`

Arquivos: `lib/use-live-sync.ts`, `lib/api/events.ts` (canal SSE-only `publishInternal`, `clientId` no evento), `store/{workspace,catalog,current-issue,issues}-store.ts` (exceto `rankBetween` da F1), `lib/adapters*.ts`, `lib/status-utils.tsx`, `data/**`, `components/layout/{data-hydrator,app-sidebar,main-layout}.tsx` e `components/layout/sidebar/**` (exceto create-new-issue e nav-inbox), `components/ui/sidebar.tsx`, `hooks/use-mobile.ts`, `components/common/palette.ts`, `package.json` (remoção de deps), `components/ui/**` (remoção de primitivos mortos), `app/[orgId]/template.tsx`.

- [ ] #11 + R3 `targeted` coalescido e sequenciado por `entity:id` (janela ~200 ms; acima de K ids → 1 hidratação coarse); switch exaustivo com `never` (`automation`/`resync` sem cast).
- [ ] #14 resync incremental: `GET /issues?updatedSince=` + lápides (endpoint aditivo; coordenar servidor: você implementa a query em `lib/api/issues.ts` num hunk pequeno) e pular resync se a aba ficou escondida pouco tempo; jitter maior em resync de pod.
- [ ] #16 + R8 catálogo inicial vazio com `loaded` (sem mocks); falha do bootstrap → `loadError` + `ErrorState` com retry no shell; status/ícone a partir do DTO (`StatusIcon({category,color})` único; `adaptStatus` sem mock); remover mocks mortos de `data/` (~1.300 linhas) mantendo os tipos.
- [ ] #17 rollback só se o valor atual ainda for o otimista (issues); `patchProject` e `toggleSubscription` com rollback por campo/id.
- [ ] #18 (issue) evento de conteúdo separado: salvar descrição não força GET do DTO da lista nos outros clientes, só recarrega detalhe aberto de outros.
- [ ] If#15 `workspace.hydrate` preserva referências de itens não alterados e respeita `updatedAt` vs `apply*` mais novo.
- [ ] If#16 própria mutação sem GET redundante: `clientId` por aba no publish; aba de origem ignora o eco e aplica o DTO da resposta do PATCH.
- [ ] If#23 `applyRemote` 404 → `removeRemote`; erro transitório → retry único.
- [ ] #56 sheet do sidebar fecha ao navegar; breakpoints alinhados (sem layout shift 768–1023).
- [ ] If#19 sem fade entre abas irmãs (template só anima troca de seção, não de aba) — ou sem `route-enter` quando só muda o último segmento.
- [ ] `resyncAll` dispara eventos de janela (para F2); `data-hydrator` hidrata inbox em paralelo às issues (para F3).
- [ ] R8 dependências sem uso (`react-icons`, `usehooks-ts`, `client-only`, `@hookform/resolvers`, `@tiptap/extension-link` se realmente sem uso, `uuid` → `crypto.randomUUID`) e primitivos `components/ui` mortos; `filterBy*` do issues-store só em teste; `labelColor()` único em `palette.ts` (If#13).

### Integração (Claude, checkout principal)

- [ ] Merge F5a → F5b → F1 → F2 → F3 → F4, resolvendo conflitos; migration única da F5a gerada por último sobre o `schema.ts` integrado.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [ ] Remedir (board, detalhe com comentários, reviews, inbox, rank) e atualizar o Estado; PR.
