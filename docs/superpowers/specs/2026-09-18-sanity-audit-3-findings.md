# Teste de sanidade 3 — achados consolidados (2026-09-18)

Base: `danilo/sanity-audit-2` @ `87350c1` (PR #170, CI verde). Recorte **por módulo** (a rodada 2 foi
por dimensão): issues, planejamento, comunicação/ferramentas, administração/acesso, infraestrutura
compartilhada — cada um avaliado em performance, otimização, refactoring, consistência de dados e
fluidez. Fontes: 5 auditores Claude + Codex (foco em regressões do PR #170) + medição empírica do
Claude (build de produção local, banco `circle_perf`: 3.011 issues, 300 notificações, ENG-1 com 107
itens de atividade). Legenda: **[M]** medido/reproduzido · **[V]** verificado no código pelo
consolidador · **[A]** apontado, não reverificado. Origem: Is/Pl/Co/Ad/If = auditores Claude
(issues/planejamento/comunicação/administração/infra), Cx = Codex, Me = medição.

## Medições desta rodada

| Cenário                                    | Resultado                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rajada de 100 edições na lista (3k issues) | 0 long tasks ✅                                                                                                                                                          |
| **Board com 20 edições remotas**           | **16 long tasks, ~1 s bloqueado (máx 92 ms)**; perfil: reconciliação do React, `IssueGrid` sem `memo` ❌                                                                 |
| Board: scroll de coluna / horizontal       | p95 24 ms / 6 ms, 0 long tasks ✅                                                                                                                                        |
| Timeline de projetos: scroll horizontal    | 0 long tasks ✅                                                                                                                                                          |
| Inbox com 300 notificações: abrir 10       | p95 18 ms, 0 long tasks; 2,8k nós DOM (lista não virtualizada) ✅/⚠️                                                                                                     |
| Detalhe ENG-1 (107 itens)                  | abre em 1,3 s, 1 long task 107 ms, CLS 0,027, 5k nós DOM ⚠️                                                                                                              |
| 10 comentários chegando ao vivo no detalhe | 0 long tasks, mas **20 refetches** (detail + activity completos por comentário) ⚠️                                                                                       |
| Digitação no editor de comentário          | p95 6 ms ✅                                                                                                                                                              |
| Command palette: digitar 13 caracteres     | 1 request de busca (debounce ok) ✅                                                                                                                                      |
| Memória: 3 voltas por 8 rotas              | 17,5 → 19,2 MB (estável) ✅                                                                                                                                              |
| **Rank (LexoRank, lib real)**              | **criação nº ~2.216 do mesmo time estoura `varchar(64)`** (ranks já com 46 caracteres em times de 1.500 issues); ~86 "mover pro topo" na mesma região também estouram ❌ |

## Alta

1. **[M][V] Rank estoura a coluna e trava criação/reorder** (If, Me) — `db/schema.ts:357` `varchar(64)` + `lib/api/rank.ts`: `increment()`/`between()` só acrescentam dígitos, sem rebalanceamento. Após ~2,2 mil issues num time (ou dezenas de arrastes na mesma região) → `22001`/500.
2. **[M][V] Board trava com eventos em tempo real** (Me) — `issue-grid.tsx:95` `IssueGrid` sem `memo`: cada evento re-renderiza todos os cards montados de todas as colunas.
3. **[V] Lista virtualizada identifica linhas por índice** (Is) — `virtual-issue-list.tsx`, `group-issues.tsx`: `useVirtualizer` sem `getItemKey`; popover/menu aberto passa a agir sobre outra issue quando a lista reordena (ex.: toggles de assignee agrupado por assignee).
4. **[V] Reorder por arraste quebrado na ordenação padrão** (Is) — ordenação default `priority` (`display-settings-store.ts:73`); `rankBetween` lança com vizinhos invertidos (erro engolido no `drop`) ou grava rank que a tela não mostra. Drop entre grupos não-status altera o status (Is#3).
5. **[V] Detalhe da initiative: Status/Priority/Owner/Parent não abrem** (Pl) — `initiative-details.tsx:386` `PropertyButton` não repassa props/ref ao `PopoverTrigger asChild`.
6. **[V] Views salvas perdem filtros de responsável/projeto** (Ad) — `app/api/v1/views/route.ts:25` e `[id]/route.ts`: `FilterSchema` sem `assigneeIds`/`projectIds`; zod descarta.
7. **[V] Membros de time: resposta incompleta corrompe o store** (Ad) — rotas de add/remove/decide devolvem `listTeamMembers` (6 campos) tipado como `MemberDto[]`; `applyTeamMembers` zera `teamIds`, `/members` pode lançar.
8. **[A] Reviews remontam a cada clique** (Co) — cada seção/PR é página sem layout comum: lista refaz fetch, perde "carregar mais", aba Created vira For you, detalhe rebaixa todos os patches. (Pré-existente ao PR #169.)
9. **[A] Sync/webhook do GitHub refecha issue reaberta** (Co) — `reviews.ts:758-769` roda `pr.merged` em todo sync/webhook de PR merged; `:788` publica `issue` por PR vinculado a cada sync.
10.   **[A] Import não escala e fura o silencioso** (Ad) — 10k linhas em série numa request (~17–30 min, além do timeout); Slack, automações e triagem por IA disparam por linha mesmo com `silent`.

## Média

**Realtime e consistência transversal** 11. **[V] Evento direcionado sem coalescência** (If, Pl, Is) — `use-live-sync.ts`: um GET por evento; bulk de 50 issues → ~150 GETs por cliente (projeto/ciclo buscados 50×); respostas fora de ordem. `GET /cycles/:id` faz upsert de snapshot sem `IS DISTINCT FROM`. 12. **[A] Sessão expirada sem tratamento** (If, Ad) — `lib/client.ts` não trata 401; SSE reconecta para sempre; `middleware.ts:57` perde o deep-link (sem `callbackUrl`). 13. **[A] Escopo do SSE congelado na abertura** (If, Ad) — `events/route.ts`: convidado adicionado a time não recebe eventos; membro rebaixado a guest segue recebendo eventos completos. 14. **[A] Resync sempre total** (If) — aba escondida > 60 s, deploy ou reconexão do LISTEN → re-hidratação completa de todos os clientes do pod em 1,5 s. 15. **[A] Settings do usuário: blob inteiro, last-write-wins e gravação cega** (If, Ad) — `user-settings-sync.ts`: GET falho → `ready=true` e o 1º toggle apaga as settings do servidor; tema importado inválido silencia toda gravação (Ad#5). 16. **[V] Catálogo nasce com mocks** (If, Ad) — `catalog-store.ts:150-155` (labels demo, `projectStatuses` = status de issue); falha do bootstrap deixa skeleton eterno sem erro (`workspace-store.ts:200`); ícone/nome de status vêm do mock (`status-utils.tsx`, `adapters.ts:20-31`) → status novo sem ícone, renomeado não reflete. 17. **[A] Rollback ainda sobrescreve estado remoto** (Cx, If) — `issues-store.ts:91-99` restaura campos sem checar se o valor ainda é o otimista; `patchProject`/`toggleSubscription` restauram o objeto/lista inteiro. 18. **[A] Salvar descrição (issue e projeto) gera refetch em todos os clientes** (Is, Pl) — cada autosave publica `issue`/`project updated` → GET do DTO em todo cliente; descrição do projeto sem concorrência otimista. 19. **[A] Inbox**: ação própria dispara hydrate completo que desfaz otimista pendente (Co#6); lista "vazia" com badge N e "Mark all read" desabilitado (Co#7, If#10: notificação de issue fora do store é descartada; inbox só hidrata após todas as issues). 20. **[V] `GET /issues/:id/subscription` sem checagem de escopo** (Cx) — rota nova do PR #170. 21. **[V] Coarse do import dispara webhook `issue.updated` sem id** (Cx) — `publish` do coarse também despacha webhook. 22. **[A] Atribuir issue assina o responsável sem avisar a aba dele** (Cx) — `issues.ts:1095-1118`. 23. **[A] Housekeeping: guarda diária marcada antes do snapshot** (Cx) — falha não libera a guarda. 24. **[A] Import com `externalId` duplicado no CSV cria duas issues** (Cx) — `import.ts:541-604` consulta o mapa inicial, não o atualizado. 25. **[A] `prev` do `updateIssue` lido fora da transação** (Is) — toggles rápidos de assignee duplicam histórico/notificação ou perdem remoção.

**Issues** 26. **[V] Detalhe sem `key` por issue** (Is) — `issue-details.tsx:492`: flash de conteúdo da issue anterior; refs de versão da descrição compartilhados → 409 falso ao navegar A→B. 27. **[M][A] Comentário/reação recarregam detail + activity inteiros** (Is, Me) — 1 reação = 1 POST + 4 GETs; 10 comentários ao vivo = 20 refetches. 28. **[A] Triagem recarrega a cada evento de qualquer issue** (Co, Is) — N+1 no servidor; card perde a edição em curso. 29. **[A] My issues > Assigned** refaz busca de até 500 DTOs a cada mudança de responsável e pode prender issue removida (Is). 30. **[A] Bulk actions** — N PATCHs paralelos, N toasts, seleção não podada (Is). 31. **[A] Busca nos seletores falha para projeto/status criados e labels renomeadas** (Is) — cmdk filtra pelo `value` (id), sem `keywords`. 32. **[A] Seletor de projeto lista outros times** → 400 genérico (Is). 33. **[A] Anterior/próxima no header segue a ordem global** (If, Is) — "3 / 3011", não a lista de origem.

**Planejamento** 34. **[A] Overview do projeto: 1ª carga falha monta editor vazio** e o autosave apaga a descrição real (Pl). 35. **[A] Dois ciclos `current` no mesmo time** permitidos (Pl). 36. **[A] Bootstrap de cycles agrega todas as issues/snapshots de todos os ciclos** e descarta (Pl). 37. **[A] Adicionar projeto a initiative mantém vínculo com a antiga** — rollups contam 2× (Pl). 38. **[A] Diálogo de ciclo perde texto digitado com evento** (Pl) — classe do #2 da rodada 2; idem `EditTeamDialog` (Ad#13) e `view-actions` Edit (Ad#19). 39. **[A] Roadmap/timeline por teclado: 1 PATCH por tecla** (Pl) — 30 PATCH/s, 30 linhas de activity. 40. **[A] Roadmap não recarrega em mudança de dependência/milestone**, sem sequência nem retry (Pl). 41. **[A] Três definições de "projeto concluído"** — números divergentes entre lista, detalhe e roadmap (Pl). 42. **[A] Criar projeto sem compensação** — falha no milestone + novo clique = projeto duplicado (Pl). 43. **[A] Board de projetos aceita drop que o servidor recusa (409)** (Pl). 44. **[A] Datas `YYYY-MM-DD` com `new Date()`** — um dia a menos em UTC−3 (Pl). 45. **[A] Abas Issues/Activity e peek do projeto não escutam eventos**; `resyncAll` não dispara eventos de janela (Pl). 46. **[A] PATCH de labels/projetos de initiative envia array completo** — cliques rápidos perdem seleção (Pl).

**Comunicação e ferramentas** 47. **[A] Diff de review sem virtualização e re-parse a cada render** (Co). 48. **[A] Tempo real de reviews apaga o "carregar mais"** (Co). 49. **[A] Notificação pessoal vai ao canal do Slack, duplicada** (Co). 50. **[A] Agent: falha do Bedrock quebra o chat** (turnos user consecutivos) e remontar apaga conversa em voo (Co). 51. **[A] Command palette sempre montada assinando stores** e resultados de buscas antigas misturados (If, Co).

**Administração e acesso** 52. **[A] Papel editado na UI é desfeito no próximo login** (Keycloak) — **decisão de produto** (Ad). 53. **[A] Eventos `catalog` de templates/emojis/SLA refazem o bootstrap** que nem contém esses dados; cache de emojis nunca invalida (Ad). 54. **[A] Convite esconde erros e o link** — `import { ApiError }` do servidor no cliente (Ad; idem audit-log e project-statuses). 55. **[A] Retry de webhook depende de tráfego** (Ad). 56. **[A] Mobile/tablet**: sheet do sidebar não fecha ao navegar; breakpoints 768 vs 1024 com layout shift (If). 57. **[A] Templates: resposta trocada entre times e vazio falso** (Ad). 58. **[A] Documentos e join requests sem evento/escuta adequados** (Ad). 59. **[A] `deleteTeam` sem transação** e sem tratar templates (FK RESTRICT) → time parcialmente destruído (Ad).

## Baixa (resumo)

Toast de sucesso antes da API no menu de contexto; promises sem catch (Is#13) · coluna do board sem `getItemKey` e `useDrag` sem deps (Is#15-16) · criar issue: status default fixo, sem ⌘Enter, rascunho perdido, identifier falso (Is#17) · rodapé "hidden by filters" (Is#18) · saved search flash (Is#19, Ad#15) · labels do create sem validação/regra exclusiva (Is#20) · delete não avisa relacionadas (Is#21) · erro do detalhe sem retry (Is#22) · dependências de projeto com checagem de ciclo fora da transação, updates sem transação/limite, `getUpcomingCycle` pega o mais distante, teclado em diálogos, `teamDescendantIds` 2×, pickers com PATCH redundante (Pl#17-22) · snooze, teclado no inbox, filtros mortos, contagem de reviews, accept da triagem sem transação, filtro de reviews só no cliente, link PR duplicado ao renomear, webhook do GitHub lento/sem ordem, guia sem dedupe, favoritos/recentes sem evento, atalhos com dialog aberto, busca em comentários sem índice (Co#12-25) · emojis (S3 antes do banco), audit log, SES síncrono no add member, contagens globais, rollback inteiro em webhooks, convidado cria time, landing do convidado, export truncado sem aviso, evento de view pessoal a todos, pulse, profile, labels duplicadas, integrations fixo, documentos sem confirmação, breakdown de times, botão do login preso, `/api/metrics` (Ad#21-40) · `workspace.hydrate` sem compartilhar referências, própria mutação faz GETs redundantes, erro de contrato (SyntaxError→500, 413 sem título), aba de issues remonta com fade, publishes sem `teamId`, timestamps sem tz, índices redundantes, hex restante, testes com sleep, `next.config` otimizando pacotes inexistentes, `applyRemote` 404 → hydrate total (If#15-23) · botão "Display" sem `aria-label` (Me).

## Refactorings com ganho concreto

- **R1 Seletores únicos** de status/prioridade/label (hoje em 2 cópias: `common/issues/*` e `create-new-issue/*`) com `keywords` — corrige #31 e evita corrigir 2× (If R3, Is R3).
- **R2 `useIssueDropTarget`** ciente de grouping/ordering — corrige #3, #4 e Is#16 num lugar (Is R1).
- **R3 Camada de sync**: `targeted` coalescido e sequenciado por `entity:id`, switch exaustivo com `never`, resync incremental, eco da própria aba ignorado via `clientId` e uso do DTO da resposta do PATCH (If R4, Pl R2, Is R2).
- **R4 `useAsyncResource` / `useProjectDetail`** (data/loading/error/reload + seq + live reload) para detalhe de projeto, templates, emojis, webhooks, triagem (Pl R1, Ad).
- **R5 Layouts de rota** para reviews (lista persistente) e projeto (detalhe compartilhado entre abas) — corrige #8 e o refetch por aba.
- **R6 Tipos que não mentem**: `MemberDto`/`ViewFilterSchema` únicos entre rota e cliente; lint `no-restricted-imports` para valores de `lib/api/*` em componentes (Ad).
- **R7 Menu de contexto único** no nível da lista (hoje por linha, ~10 assinaturas cada) (Is R5).
- **R8 Limpeza**: ~1.300 linhas de mocks mortos em `data/` (causa raiz de #16), 9 dependências sem uso, tooltips mortos, `filterBy*` do issues-store só em teste, `command-palette.tsx` (996 linhas) e `initiative-details.tsx` (1.034) divididos por seção.

## Decisões pendentes do usuário

- **#52** Papel: Keycloak/Orbis é a fonte única (UI deixa de editar papel) ou o Circle mantém override local?
- **#10** Import: virar job em background com progresso muda o contrato de `/import/commit`.
- **#15** Settings por seção (merge no servidor) muda o contrato de `/settings`.
- **#1** Rank: trocar a estratégia (fractional-indexing com ponto médio real + coluna `text`) exige migration de dados dos ranks existentes.

As quatro decisões foram tomadas em 2026-09-18 (ver o plano `2026-09-18-sanity-audit-3.md`).

## Remedição após as correções (2026-09-18)

Mesmo ambiente da medição original: build de produção local, banco `circle_perf` (3.011 issues,
300 notificações, ENG-1 com mais de 100 itens de atividade), mesmos scripts Playwright.

| Cenário                                    | Antes                                                  | Depois                                                    |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------- |
| **Board com 20 edições remotas**           | 16 long tasks, ~1 s bloqueado (máx 92 ms)              | **0 long tasks**, p95 6 ms ✅                             |
| Board: scroll de coluna / horizontal       | p95 24 ms / 6 ms                                       | p95 6 ms / 6 ms ✅                                        |
| **10 comentários ao vivo no detalhe**      | 20 requisições (detail + activity por comentário)      | **1 requisição** (só o feed, rajada coalescida) ✅        |
| Detalhe ENG-1: abrir                       | 1,3 s, 1 long task 107 ms, CLS 0,027                   | 1,1–1,4 s, 1 long task 70–152 ms, CLS 0,026 (variação) ⚠️ |
| Inbox com 300 notificações: abrir 10       | p95 18 ms, 0 long tasks                                | p95 6 ms, 0 long tasks ✅                                 |
| Rajada de 100 edições na lista             | 0 long tasks                                           | 0 long tasks ✅                                           |
| Timeline de projetos / digitação no editor | 0 long tasks / p95 6 ms                                | 0 long tasks / p95 6 ms ✅                                |
| Command palette: digitar 13 caracteres     | 1 request                                              | 1 request ✅                                              |
| Memória: 3 voltas por 8 rotas              | 17,5 → 19,2 MB                                         | 20,6 → 24,1 MB (estável entre voltas) ✅                  |
| Erros de página                            | 0                                                      | 0 ✅                                                      |
| **Rank**                                   | estouro de `varchar(64)` por volta da criação nº 2.216 | coluna `text` + rebalanceamento ≤ 32 caracteres ✅        |

**Migration 0050 no Postgres real (`circle_perf`):** ranks de até 46 caracteres passaram a 10 e a
ordem das 3.011 issues ficou idêntica (comparação linha a linha antes e depois). Continua 1 cycle
`current` por time. Também há teste com PGlite partindo da 0049 com dados
(`test/migration-0050-data.test.ts`).

**Verificação final:** `pnpm test` com 308 arquivos e 1.581 testes, exit 0, sem erros não tratados;
`pnpm typecheck`, `pnpm lint` e `pnpm build` limpos.
