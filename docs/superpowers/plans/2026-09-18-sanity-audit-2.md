# Sanidade 2 — correção de todos os achados — Implementation Plan

> **For agentic workers:** execute a SUA frente (A, B, C1, C2 ou D) task a task. Steps usam checkbox (`- [x]`).

## Estado (handoff entre agentes)

- **Onde:** branch `danilo/sanity-audit-2` (de `origin/develop` `5592983`), checkout principal `C:/Projetos/circle`. Frentes A/B/C1/D (Claude) e C2 (Codex) integradas; worktrees removidos.
- **Feito:** todas as frentes + amarrações da integração: `selectIssuesLoading` em ciclo/perfil; import mantém webhook por issue (`dispatchWebhooksOnly`); live-sync trata `resync` e aviso de assinatura; hidratação com cursor `(rank, id)`; issue fechada seguida consultável (`GET /issues/:id/subscription`, `GET /me/subscriptions`); CRUD de automações publica `automation`; cache de usuário por request invalidado nas escritas em `app_user` (o PATCH /me respondia com o nome antigo).
- **Última verificação:** 2026-09-18, Claude — `pnpm test` 202 arquivos/1.235 testes ok, `pnpm typecheck` ok, `pnpm lint` ok, `pnpm build` ok. Remedição no build de produção (banco `circle_perf`, 3k issues): ver "Resultado" em `docs/superpowers/specs/2026-09-18-sanity-audit-2-findings.md`.
- **Próximo passo:** review e merge do PR #170 para `develop`.
- **Pendências conhecidas:** (1) colisão de rank em criações concorrentes só é provável em Postgres real (advisory lock implementado; PGlite é single-connection); (2) publishes de `triage`/`attachments`/`projects`/`teams` ainda sem `teamId` — convidado recebe esses eventos redigidos (comportamento anterior, sem regressão); (3) editor (~450 KB) segue baixado em segundo plano após a hidratação em toda rota — adiar para o primeiro uso é opcional (troca por latência na 1ª abertura do modal); (4) navegação sem `loading.tsx` espera o RSC (180–420 ms com RTT de 120 ms), como antes do PR #169.

**Goal:** resolver os 47 achados do teste de sanidade 2 sem regressão e com ganho medido.

**Spec:** `docs/superpowers/specs/2026-09-18-sanity-audit-2-findings.md` (números `#N` abaixo referem-se a ele).

## Decisões do usuário (2026-09-18)

- **#14 Projeto trocado de time:** bloquear com **409** quando o projeto tiver issues de outro time; nada é migrado.
- **Bootstrap enxuto (#17/#38):** pode mudar o formato do `/workspace`: remover `teams[].projects` (front deriva de `projects`), `me.subscribedIssueIds` só de issues **abertas** (categoria não completed/canceled), `burnup` só do ciclo **current** (demais sob demanda via `getCycle`). Front ajustado junto.
- **#47 Idioma:** manter como está; textos novos seguem o idioma da tela.

## Global Constraints

- Contexto pt-BR, código em inglês. Conventional Commits em pt-BR, sem emoji, **sem mencionar IA/assistente**, sem `Co-Authored-By`.
- Nunca commitar o seam `CIRCLE_DEV_AUTH_EMAIL`.
- Correção de comportamento começa com **teste que falha** (`test/`, Vitest + PGlite; UI com jsdom + Testing Library, ver `test/setup-dom.ts`).
- Camadas: UI → `lib/client.ts` → `app/api/v1` → `lib/api` → `db`. Cores só por token.
- Contratos: só as mudanças decididas acima; o resto **aditivo/retrocompatível** (campos novos opcionais).
- **Migrations: só a frente C2** gera (`pnpm db:generate`, aditivas, sem DROP de dado).
- Não rodar `pnpm build`/`pnpm dev`; rodar testes específicos + `pnpm typecheck` ao fim da frente. A suíte completa roda na integração.
- Publish de SSE sempre **depois** do commit.

## Frentes e posse de arquivos

Cada frente mexe só nos seus arquivos; se precisar tocar outro, faça a menor mudança possível e registre no relatório.

### Frente A — render/performance do front (Claude)

Arquivos: `components/common/issues/**` (inclui `grouped-issues-view.tsx`, `virtual-issue-list.tsx`, `issue-line.tsx`, seletores), `components/layout/sidebar/create-new-issue/**`, `components/layout/sidebar/org-switcher.tsx`, `components/common/projects/projects-timeline.tsx`, `components/common/inbox/**` (exceto estados vazios já feitos), `components/layout/sidebar/nav-inbox.tsx`, `components/common/issues/details/content-blocks.tsx`, `components/common/agent/**`, `components/layout/headers/agent/**`.

- [x] #1 Contagens dos seletores (priority/status/label/project) só calculadas com o popover **aberto** (subcomponente montado dentro do `PopoverContent`); `orderedIssues` estável por linha (sem array novo a cada render); `useDrop` não re-registra à toa. Teste: render de N linhas + mudança no store não chama o cálculo de contagem com popover fechado.
- [x] #2 Form de criar issue: reset só quando o modal **abre** (false→true) ou após criar; nunca por troca de referência do catálogo. Teste reproduzindo: digitar, trocar `statuses` no catalog-store, título preservado.
- [x] #5 `org-switcher` vira botão que chama `useCreateIssueStore.getState().openModal()`; uma única instância do `CreateNewIssue` (a do provider adiado). Teste: abrir modal → 1 dialog.
- [x] #9 Board: loading/erro/vazio aparecem quando não há issues (condição por `issues.length`/grupos todos vazios), com retry no erro.
- [x] #30 (parte) Loading da lista de issues usa `ListSkeleton` alinhado ao topo (não o retângulo 64×16).
- [x] Fr#2 `LinkedIdentifiers` (`content-blocks.tsx`): chaves de time vindas de `useWorkspaceStore(s => s.teams)` memoizadas, sem varrer issues no seletor. Agent: seletores estreitos, mensagens `memo`, streaming em lote (rAF), scroll só quando necessário.
- [x] Fr#6 `issue-details.tsx`/`issue-preview.tsx`: seletor `s.issues.find(...)` estreito.
- [x] #26 Timeline: escala e linhas em componentes `memo` independentes do `viewport`; só o indicador depende dele.
- [x] #27 Inbox: `Map` identifier→status montado uma vez no pai, linha `memo`, seletores estreitos; `nav-inbox` lê só `unreadCount`.
- [x] #41 `motion.div` → `div` quando não há `layoutId`.

### Frente B — sincronização e consistência no cliente + bootstrap (Claude)

Arquivos: `store/**`, `lib/use-live-sync.ts`, `lib/adapters*.ts`, `lib/api/workspace.ts` (formato do bootstrap), `lib/api/cycles.ts` (só burnup no DTO), `lib/api/users.ts`/`me` (só `subscribedIssueIds`), telas com cache local: `components/common/projects/details/**`, `components/common/initiatives/initiative-details.tsx`, `components/common/teams/team-documents.tsx`, `components/common/settings/team-workflows-settings.tsx`, consumidores de `loaded` das issues (`all-issues.tsx` etc.).

- [x] #4 `issues-store` ganha `loaded` (false até a 1ª hidratação terminar); consumidores tratam `!loaded` como carregando. Teste: store inicial + render sem flash de vazio.
- [x] #1 (parte store) `sortByRank` com comparação binária (`<`), remover `issuesByStatus` sem leitor, hidratação progressiva adapta só a página nova.
- [x] #6 Reconexão do SSE (`onopen` que não é o primeiro) agenda re-hidratação de issues, workspace e notificações. Teste com EventSource falso.
- [x] #12 Evento `label` atualiza o catálogo (hidrata workspace/catalog), não baixa todas as issues à toa.
- [x] #13 (cliente) `removeProjectLocal`/`removeCycleLocal` limpam `project`/`cycleId`/`milestone` das issues no issues-store.
- [x] #15 Rollback por item/campo em `issues-store` (`updateIssue`, `deleteIssue`, labels) e `notifications-store` (`markAsRead`, `markAllAsRead`, `snooze`, `unsnooze`). Teste: mudança remota em outra issue sobrevive ao rollback.
- [x] #16 `applyRemote`/hidratação não sobrescrevem item mais novo (`updatedAt`) e hidratações concorrentes usam token de sequência (a mais antiga é descartada).
- [x] #17 (cliente) `cycle`/`member`/`view`/`team` com id → fetch direcionado (`applyCycle`/`applyUser`/`applyView`/`applyTeam`); `document` sai do mapa (vira evento de janela); jitter 0–1,5 s no hidrate coarse.
- [x] #17/#38 Bootstrap enxuto (decisão do usuário): remover `teams[].projects` (contagens derivadas no cliente), `subscribedIssueIds` só de issues abertas no bootstrap e no `/me`, `burnup` só do ciclo current (demais via `getCycle` quando a tela precisar). Ajustar adapters/telas/testes.
- [x] #19 (cliente) evento de comentário/reação usa o `issueId` do payload (a frente C1 adiciona o campo) para recarregar só o detalhe certo; sem `issueId` mantém o comportamento atual.
- [x] #28 Eventos de janela com id (`PROJECT_CHANGED`, `INITIATIVE_CHANGED`, `DOCUMENT_CHANGED`, `AUTOMATION_CHANGED`) disparados pelo live-sync; telas de detalhe de projeto, feed da initiative, documentos e automações recarregam em silêncio.
- [x] #29 `notifications-store` com `loadError`; inbox mostra `ErrorState` com retry quando a 1ª carga falha (ajustar `test/notifications-loaded.test.ts`).
- [x] #33 `addIssue` não duplica se o evento `created` chegou antes da resposta.

### Frente C1 — servidor: eventos, realtime e issues (Claude)

Arquivos: `lib/api/events.ts`, `app/api/v1/events/route.ts`, `lib/api/issues.ts`, `lib/api/import.ts`, `lib/api/notifications.ts`, `lib/api/reviews.ts`, `lib/api/cycles.ts` (publish/rollover), `lib/api/comments*`/reações, `lib/api/integrations/sentry.ts`, `lib/api/webhooks.ts`, `lib/api/users.ts` (provision), `lib/api/issue-detail.ts` (só descrição/#36), cliente do editor para #36. **Sem migrations** (pedir à C2 se precisar de índice — já listados lá).

- [x] #7 Import em modo silencioso: `createIssue`/`updateIssue` aceitam opção para não publicar; ao fim, um único `publish({ entity: 'issue' })` sem id (coarse). Teste: import de N linhas publica 1 evento.
- [x] #8 Mudanças de issue que afetam rollup publicam `project/updated` (antigo e novo) e `cycle/updated`; `deleteIssue` publica `issue/updated` do pai.
- [x] #10 `updateIssue`: histórico (`activityEvent`) na mesma transação; automações/efeitos depois do commit, falha deles não devolve erro de mutação já commitada; publish após commit.
- [x] #18 Evento de notificação leva `recipientId`; SSE entrega só ao destinatário.
- [x] Fan-out por time (Be#3, Cx#8): `publish` leva `teamId` quando houver; o stream de usuário restrito/convidado entrega **com id** os eventos do escopo e descarta os de fora (sem query por evento).
- [x] #19 (servidor) eventos de comentário/reação incluem `issueId` (campo aditivo).
- [x] #20 Rollover de ciclo publica `cycle/updated` + sinal de issues **após** o commit; `createNextCycle` não publica dentro da transação.
- [x] #6 (servidor) conexão LISTEN com keepalive/ping periódico; após reconectar, emite evento local de resync para os subscribers do pod.
- [x] #22 Sweep de webhooks: `pg_try_advisory_xact_lock` dentro de transação (ou client dedicado); não roda a cada publish (throttle); entregas sem `await` serial.
- [x] #25 Lexorank: create detecta colisão; reorder trata vizinhos empatados/invertidos (sem lançar 500); paginação keyset por `(rank, id)` retrocompatível (cursor antigo continua aceito).
- [x] #32 Label exclusiva em transação com `FOR UPDATE` na issue.
- [x] #34 Reviews: publish depois de gravar checks/arquivos; `check_run` publica; link de PR publica `issue`.
- [x] #35 subscribe/unsubscribe publicam para o próprio usuário; `provisionUser` publica `member`.
- [x] #12 (servidor) labels criadas pelo import e pelo Sentry publicam `label`.
- [x] #36 Descrição: concorrência otimista opcional (`expectedUpdatedAt`/If-Match → 409 quando divergir; sem o campo, comportamento atual); o editor trata 409 recarregando e avisando.
- [x] #39 `listReviews` com projeção explícita (sem `guide`).

### Frente C2 — servidor: dados, integridade e banco (Codex)

Arquivos: `db/schema.ts`, `db/migrations/**` (única frente que gera), `lib/api/members.ts`, `lib/api/teams.ts`, `lib/api/projects.ts`, `lib/api/project-snapshots.ts`, `lib/api/statuses.ts`, `lib/api/search.ts`, `lib/api/issue-detail.ts` (só `listMyActivity`), `lib/api/workspace.ts` (só housekeeping), `lib/api/http.ts`/`scope.ts`/`auth.ts` (só #40), rotas correspondentes.

- [x] #11 `listMyActivity` com `ORDER BY created_at DESC LIMIT` em cada query.
- [x] #13 (servidor) `deleteProject` limpa `issue.milestoneId`; migration: limpar órfãos existentes + FK `issue.milestone_id → project_milestone ON DELETE SET NULL` + índice.
- [x] #14 `updateProject` com `teamId` diferente e issues de outro time → **409** (decisão do usuário).
- [x] #21 Housekeeping do bootstrap: guarda por pod (1×/dia por time), rollover sequencial, snapshot com agregação SQL e upsert `WHERE ... IS DISTINCT FROM`.
- [x] #23 Busca: ramos indexados (GIN de issue/issue_content) via `UNION`, ramo de comentário com limite próprio; `likeSearch` só quando fizer sentido.
- [x] #24 Reordenação de status em transação; lista parcial é normalizada (ids enviados na ordem dada, os demais depois na ordem atual — retrocompatível); publica `catalog/updated`.
- [x] #31 Último admin: validação + alteração em transação com lock das linhas de admin.
- [x] #37 Índices: `notification(issue_id)`, `notification(recipient_id, created_at desc)`, parcial `notification(recipient_id) where read = false`, `issue_pr_link(issue_id)`, `activity_event(actor_id, created_at)`, `comment(author_id, created_at)`.
- [x] #40 Usuário resolvido uma vez por request (sem refazer 3–4 lookups de `app_user`), sem mudar contratos.
- [x] Cx#7 `listMembers`/`listTeams` aplicam escopo no SQL (não carregam tudo para filtrar em memória).

### Frente D — UI/layout (Claude)

Arquivos: `app/[orgId]/loading.tsx`, `app/[orgId]/error.tsx`, `app/[orgId]/profiles/**`, `app/globals.css`, `components/common/cycles/**`, `components/common/members/**`, `components/common/reviews/**`, `components/common/settings/{webhooks,emojis,agent-personalization}-settings*`, `components/common/teams/team-line.tsx`, paletas em `insights-panel.tsx`/`breakdown-panel.tsx`/`initiative-status-icon.tsx`/`initiatives.tsx`, e textos de not-found nos detalhes (hunks pequenos; B também mexe nesses arquivos por outro motivo).

- [x] #3 Remover `app/[orgId]/loading.tsx` (as telas têm skeletons próprios); ajustar `test/route-loading.test.tsx`. Manter `app/loading.tsx` (rotas públicas).
- [x] #46 `.route-enter` só com `opacity` (sem `transform`).
- [x] #30 cycles com guarda de `loaded`; `CycleIssues` e perfil de membro repassam `loading`/`error`/`onRetry`; ciclo ativo inexistente → `EmptyState` próprio; onboarding de Reviews `w-full max-w-[540px]`; perfil de membro com skeleton/EmptyState; textos crus em webhooks/reviews/initiative/not-found → `ListSkeleton`/`EmptyState`/`ErrorState`; skeleton inline de reviews → `ListSkeleton`.
- [x] #42 `[orgId]/error.tsx` dentro do mesmo frame do `MainLayout`.
- [x] #43 Tokens `--priority-*`/`--health-*` em `globals.css` (light/dark) e paletas lendo deles; `agent-personalization` usa token de sucesso.
- [x] #44 `team-line.tsx` sem `/50` no muted.
- [x] #45 `issue-line.tsx` sem `transition-all` em `space-x` (coordenar: arquivo da frente A — só essa linha) e emojis sem `h-[calc(100vh-…)]`.

### Integração (Claude, checkout principal)

- [x] Merge das frentes na ordem C2 → C1 → B → A → D, resolvendo conflitos.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` verdes.
- [x] Remedir com os scripts do teste de sanidade (SSE na lista, form, loading, flash, bundle `/members`, payload `/workspace`).
- [x] Atualizar Estado, abrir PR para `develop`.
