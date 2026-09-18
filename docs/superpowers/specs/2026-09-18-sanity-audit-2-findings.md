# Teste de sanidade 2 — achados consolidados (2026-09-18)

Base: `develop` @ `5592983`. Fontes: Codex (`codex exec`, read-only), 4 auditores Claude
(backend/banco, consistência/realtime, front runtime, layout/UX) e medição empírica do Claude
(build de produção local + Playwright + log de queries do Postgres, banco `circle_perf` com
3.011 issues, 43 projetos, 1.500 comentários). Legenda: **[M]** medido/reproduzido,
**[V]** verificado no código pelo consolidador, **[A]** apontado por um auditor, não reverificado.
Entre parênteses, quem apontou (Cx = Codex, Be/Co/Fr/La = Claude backend/consistência/front/layout).

## Medições de referência

| Medida                                        | Valor                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Carga fria `/team/ENG/all` (3k issues)        | 1ª linha 1,07 s · networkidle 1,58 s · LCP 652 ms · CLS 0 · heap 32 MB · 1,8k nós DOM                                        |
| 20 edições remotas (SSE) com a lista aberta   | **13 long tasks, 3,36 s bloqueados, máx 342 ms; frame p95 297 ms**                                                           |
| Mesmas 20 edições com detalhe de issue aberto | 0 long tasks (ok)                                                                                                            |
| Scroll da lista virtualizada                  | frame p95 55 ms, 11 frames > 50 ms, long task máx 80 ms                                                                      |
| `/workspace` (bootstrap)                      | 23 queries, ~22 ms, 173 KB (71 KB gzip), sendo **120 KB de `me.subscribedIssueIds`** e 13 KB de `teams[].projects` duplicado |
| `/issues?limit=2000`                          | 9 queries, ~150 ms, 971 KB (69 KB gzip)                                                                                      |
| Criar issue via API (8 concorrentes)          | p50 188 ms · p95 395 ms (comentário: p50 100 ms)                                                                             |
| JS de primeira carga                          | `/inbox` 455 kB · `/projects` 432 kB · `/issue` 404 kB · telas leves 107–220 kB                                              |
| Rota sem editor (`/members`)                  | baixa ~450 KB (raw) de Tiptap/ProseMirror                                                                                    |
| Navegação com RTT 120 ms                      | fallback `[orgId]/loading.tsx` aparece em 5/5 navegações (header some)                                                       |

## Alta

1. **[M][V] Evento SSE trava a lista de issues** (Fr) — `priority-selector.tsx:42`, `status-selector.tsx:44`, `create-new-issue/label-selector.tsx:34`, `project-selector.tsx:33`: cada linha visível recalcula contagens filtrando todas as issues (perfil de CPU: `issues.filter(i => i.labels.some(...))` por label e `filter(status)` por status são o topo). Somam-se `orderedIssues` novo por render (`grouped-issues-view.tsx:227`) e `sortByRank` com `localeCompare` + `issuesByStatus` sem leitor (`issues-store.ts:71`).
2. **[M][V] Formulário de criar issue perde o que foi digitado** (Fr) — `create-new-issue/index.tsx:84-86`: o efeito depende de `status`/`priorities`, recriados a cada hydrate do workspace. Reproduzido: outro usuário renomeia um time → título digitado some.
3. **[M][V] `[orgId]/loading.tsx` (PR #169) faz o header sumir em toda navegação** (La) — boundary acima do `MainLayout` per-página; com `staleTimes.dynamic=0` o fallback entra sempre.
4. **[M][V] Flash de "Nenhuma issue" no deep-link frio** (La) — `issues-store.ts:97` nasce `loading:false` sem `loaded`.
5. **[M][V] Editor no chunk de toda rota + modal duplicado** (Fr) — `org-switcher.tsx:23,68` importa `CreateNewIssue` estático; `create-issue-modal-provider.tsx` monta outro. Medido: 2 dialogs/2 editores ao abrir; ~450 KB de editor em `/members`.
6. **[V] Reconexão do SSE não recupera eventos perdidos** (Co, Cx, Be) — `use-live-sync.ts:121-123` (`onopen` só zera tentativas); LISTEN sem keepalive (`events.ts:141`).
7. **[V] Import gera tempestade de eventos** (Be) — `import.ts:601` → `createIssue` publica por linha; cada cliente faz 1 GET por evento; `dispatchWebhooks`/`pg_notify` disputam o pool (max 10).
8. **[V] Rollups não atualizam** (Co) — mudar status/projeto/ciclo de issue só publica `issue`; `percentComplete`/`issueCount`/scope do ciclo vêm do servidor e ficam velhos. `deleteIssue` não avisa o pai.
9. **[V] Board nunca mostra carregando/erro/vazio** (La) — `grouped-issues-view.tsx:403`: todas as colunas vazias vão para `hiddenGroups`.
10.   **[V] `updateIssue` grava histórico/automação fora da transação** (Cx) — `issues.ts:946-967` vs `:1029-1041`: falha após o commit devolve erro sem publicar SSE.
11.   **[V] My activity sem limite nem índice** (Cx, Be) — `issue-detail.ts:766-777` busca todo o histórico do usuário e corta em memória.

## Média

12. **[V] Label não atualiza o catálogo** (Co) — `use-live-sync.ts:35` manda `label` só para `issues` (baixa todas as issues em todos os clientes) e não atualiza `catalog-store.labels`; import/Sentry criam labels sem evento.
13. **[V] Apagar projeto/ciclo deixa issues apontando pro removido** (Co, Cx) — `removeProjectLocal`/`removeCycleLocal` não tocam o issues-store; `deleteProject` não limpa `issue.milestoneId` (coluna sem FK, `0026`).
14. **[V] Projeto trocado de time mantém issues no time antigo** (Cx) — `teamId` é editável em `updateProject` sem migrar/validar issues.
15. **[V] Rollback restaura o store inteiro** (Co, Cx) — `issues-store.ts:224-252`, `notifications-store` (`markAsRead`, `markAllAsRead`, `snooze`): apaga mudanças de outros que chegaram no intervalo.
16. **[A] Estado velho sobrescreve novo** (Co) — `applyRemote`/`hydrate` sem `updatedAt`/token de sequência.
17. **[V] Evento coarse → rajada de bootstrap em todos os clientes** (Be, Cx) — `cycle/team/member/view/document/catalog` → `/workspace` inteiro; `document` nem está no bootstrap; `me.subscribedIssueIds` (120 KB com 3k issues) e `teams[].projects` duplicado (**[M]**) são rebaixados a cada vez.
18. **[V] Notificação é difundida para todos** (Be) — `notifications.ts:188` publica sem destinatário; todos refazem o inbox. Falta índice `(recipient_id, created_at)` e parcial de não lidas.
19. **[V] Comentário faz qualquer detalhe aberto refazer fetch** (Fr) — `use-live-sync.ts:185-195` envia `id: undefined`.
20. **[A] Rollover de ciclo silencioso e publish antes do commit** (Co, Cx) — `cycles.ts:296-354`, `:385`.
21. **[A] Housekeeping escreve em toda abertura** (Be, Cx) — rollover + snapshots por request em `workspace.ts:119-127`, sem guarda por dia (correção incompleta da auditoria anterior).
22. **[V] Advisory lock do sweep de webhooks via pool** (Be) — `webhooks.ts:458-475`: lock e unlock podem cair em conexões diferentes; sweep roda a cada publish.
23. **[A] Busca full-text não usa GIN** (Be) — `search.ts:277-281` (`OR` com `EXISTS ... ILIKE`).
24. **[V] Reordenação de status parcial, sem transação e sem evento** (Cx) — `statuses.ts:129-139`.
25. **[A] Corridas de lexorank** (Co, Cx) — `issues.ts:666-671`, `:1297-1319`; `LexoRank.between` lança com vizinhos empatados/invertidos; keyset `rank > cursor` pula empates.
26. **[A] Timeline re-renderiza ~1.000 nós por frame no scroll** (Fr) — `projects-timeline.tsx:314-320`.
27. **[A] Inbox: `find` por linha e store sem seletor** (Fr) — `inbox/issue-line.tsx:55-57`, `inbox.tsx:69-81`, `nav-inbox.tsx:34`.
28. **[A] Cache local sem escuta de eventos** (Co) — detalhe de projeto, feed de initiative, documentos, automações.
29. **[V] Inbox mostra "vazio" quando a primeira carga falha** (Cx) — PR #169: `loaded:true` no catch sem `loadError`.
30. **[A] Estados ad-hoc restantes** (La) — cycles sem `loaded` (`cycles.tsx:44`), `CycleIssues`/perfil sem `loading`/`error`, skeleton 64×16 px das issues, onboarding de Reviews com `w-[540px]` fixo, textos crus em perfil/initiative/webhooks/reviews.

## Baixa

31. Último admin: check-then-act sem transação (`members.ts:123-136`) (Cx) · 32. Label exclusiva sem transação (`issues.ts:1343-1360`) (Co) · 33. `addIssue` pode duplicar (Co) · 34. Reviews publicam antes de gravar checks; check_run sem evento (Co) · 35. Subscribe/primeiro login sem evento (Co) · 36. Descrição last-write-wins (Co) · 37. Índices de FK: `notification.issue_id`, `issue_pr_link.issue_id` (Be) · 38. Cycles com burnup de todo o histórico no bootstrap (Be) · 39. `listReviews` traz `guide` sem uso (Be) · 40. `app_user` buscado 3–4× por request (Be) · 41. `motion` completo para `motion.div` sem layout (Fr) · 42. Erro do workspace fora do frame (`[orgId]/error.tsx`) (La) · 43. Hex literal/paletas duplicadas e divergentes (La) · 44. Contraste `text-muted-foreground/50` (La) · 45. `transition-all` em `space-x` (La) · 46. `transform` do `.route-enter` por 180 ms sobre `fixed` (Cx) · 47. Idioma dos textos novos (en vs pt-BR) — decisão de produto (Cx).

## Verificado e OK

Lista e board virtualizados; SSE com cleanup, heartbeat, backoff e desconexão em aba oculta; um
único EventSource e um bootstrap por sessão ao navegar (medido); `pg_notify` ~200 B; LISTEN
único por pod; identifier atômico; `deleteIssue` transacional; assemble sem N+1; timeouts de
pool/statement; caches em memória limitados; CLS 0 na carga fria; imagens com tamanho fixo;
`prefers-reduced-motion` coberto; detalhe de issue não sofre com eventos de outras issues (medido).

## Resultado após as correções (remedição, mesmo ambiente e scripts)

| Medida                                      | Antes                                                          | Depois                                                              |
| ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| 20 edições remotas (SSE) com a lista aberta | 13 long tasks, 3,36 s bloqueados, máx 342 ms, frame p95 297 ms | **0 long tasks**, frame p95 8,4 ms                                  |
| Scroll da lista virtualizada                | 11 frames > 50 ms, p95 55 ms                                   | **0**, p95 8,5 ms                                                   |
| Carga fria `/team/ENG/all` (5 rodadas)      | 1ª linha 1,07 s, LCP 652 ms, heap 32 MB                        | **1ª linha 340–470 ms, LCP ~350 ms, heap 20 MB**                    |
| Flash de vazio no deep-link                 | sim                                                            | **não**                                                             |
| Fallback com header sumindo (RTT 120 ms)    | 5/5 navegações                                                 | **0/5**                                                             |
| Modal de criar issue                        | 2 dialogs / 2 editores                                         | **1 / 1**                                                           |
| Título digitado + evento de outro usuário   | perdido                                                        | **preservado**                                                      |
| `/workspace`                                | 173 KB, 23 queries                                             | **123 KB, 14 queries** (`teams` 26,8 → 1,2 KB; housekeeping 1×/dia) |
| `/me` · `/inbox/unread-count`               | 4 · 3 queries                                                  | **3 · 2 queries**                                                   |
| Busca `/search?q=login`                     | ~22 ms                                                         | **~12 ms**                                                          |

Correção de diagnóstico: o editor (~450 KB) **não** estava no caminho crítico — já era baixado depois
da hidratação pelo provider adiado (antes e depois); o defeito real do #5 era a instância duplicada.
