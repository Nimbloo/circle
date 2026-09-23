# Sanidade 5 — pendências da rodada 4 e provocações do Codex sobre a v0.41.0 (2026-09-22)

Base: `develop` @ v0.41.0 (em produção). Fontes: provocações do Codex com testes descartáveis
executados de verdade (`2026-09-22-sanity-audit-5-codex-provocations.md`), verificação do
integrador em produção e no build local, e duas frentes de correção (servidor e UI).

## Verificado em produção pelo integrador

| Item                                                        | Evidência                                                                                                                        | Resultado                                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/metrics` público                                      | `curl` sem VPN → **200**, 288 linhas de métricas técnicas (process/nodejs/http por rota), sem PII                                | Estava aberto. O relatório da rodada 4 ("só pela VPN") estava errado. Fechado no chart: `nimbloo-k8s#781` (`directResponse 404` no VirtualService; o ServiceMonitor raspa o Service direto) |
| Invalidação do cache de catálogos entre pods                | `lib/api/events.ts:339-345`: o evento recebido por `pg_notify` passa pelo mesmo `fanOutLocal` que dispara o `subscribe` do cache | OK                                                                                                                                                                                          |
| `CIRCLE_TIME_ZONE`                                          | não definido no deploy → default `America/Sao_Paulo`                                                                             | OK para o Nimbloo                                                                                                                                                                           |
| Labels duplicadas em produção (o dedupe da 0052 renomearia) | query no banco de prd: **0** duplicatas                                                                                          | O dedupe não altera nada em prd                                                                                                                                                             |
| Branches remotas antigas                                    | 4 branches `danilo/*` com 0 commits à frente da `develop`                                                                        | apagadas                                                                                                                                                                                    |

## Bugs provados pelo Codex (todos corrigidos nesta rodada)

1. **Undo restaurava issue já apagada por outra aba.** `removeRemote` registra `remoteDeletedIds`; o Undo e o commit tardio ignoram esses ids (toast "Issue was deleted", sem DELETE 404).
2. **Updates de projeto/initiative editáveis por qualquer membro.** Agora só autor ou admin (403); leitura+escrita na mesma transação com `returning` conferido (editar/excluir algo já apagado → 404).
3. **Mover label para um grupo não resolvia conflito.** `updateLabel` desvincula a label movida das issues que já tinham outra do grupo; evento por issue, coarse acima de 20.
4. **Review órfã na exclusão de time.** `deleteTeam` nulifica `resolvesIdentifier/Title`; o impacto passa a contar `attachments` e `reviews`.
5. **Migrations 0050/0051 não idempotentes.** `IF NOT EXISTS` e `DO $$ ... EXCEPTION` nas constraints (SQL editado sem tocar snapshot/journal). Teste roda as duas 2× num PGlite.

## Pendências da rodada 4 fechadas

- Nome de label único no banco (índice `lower(trim(name))` + dedupe prévio) com 409 claro; corrida provada com 3 criações simultâneas → 1 passa, 2 dão 409.
- "Reviewed" do diff persistido (`review_file_state`, rotas `GET/PUT /reviews/:id/file-states[/...path]`), localStorage vira cache inicial.
- Chat do Agent com falha do provedor fica salvo (`agent_message.error`), com "Tentar de novo".
- Contagens do seletor de status por time.
- Timeline mantém a ordem durante o arraste; chip do próprio projeto escondido na aba Issues do projeto.
- Mobile: favoritos reordenam por menu (não havia como no touch); ações do grupo de labels e cabeçalho de updates não estouram.
- Nome do documento: UI e API alinhadas em 196 (a API estava em 128 por erro meu na integração da rodada 4); nome vazio avisa em vez de sumir em silêncio.
- **Busca em comentários com trigram: NÃO feita, por decisão.** As migrations 0044/0047 documentam que `pg_trgm`/`unaccent` não existem no RDS compartilhado; zero `CREATE EXTENSION` no histórico.

## Suspeitas do Codex — fechadas no fim da rodada (2026-09-23)

- Sub-times de quem é membro só do time pai: agora aparecem aninhados em "Your teams" (`nav-teams.tsx` usa `teamWithDescendants` dos times do usuário), como no Linear e como o escopo da API.
- `PATCH /favorites {order}` com ids repetidos: deduplicado no serviço (`reordered` conta uma vez, posições contíguas). O contrato não muda (continua 200).
- Documento apagado com o editor aberto: um 404 no autosave leva à tela "Document not found", a mesma do evento SSE.

## Remedição no build de produção local (develop integrada, banco clonado do dev, 53 migrations)

| Check                                                                 | Resultado                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| 3 criações simultâneas de label "Race"                                | 1 criada, 2 × 409 "já existe" ✅                       |
| Mesmo nome com caixa/espaços diferentes                               | 409 ✅                                                 |
| Mover label B para o grupo de A numa issue com A e B                  | issue fica só com A ✅                                 |
| Editar/excluir update do próprio autor; excluir 2×; editar apagado    | 200 / 200→404 / 404 ✅                                 |
| Outro membro edita update                                             | 403 (teste `project-updates-edit`, initiative idem) ✅ |
| Impacto de exclusão de time conta reviews e anexos; DELETE em cascata | ✅                                                     |
| Agent com provedor indisponível                                       | 503 e o chat fica salvo com `error: true` ✅           |
| Reviewed persistido                                                   | PUT 200, GET devolve o path ✅                         |
| Documento: 150 caracteres aceitos, vazio recusado (400)               | ✅                                                     |
| Migrations 0050/0051 rodadas 2×                                       | não falham (teste) ✅                                  |

**Verificação final:** `pnpm test` 383 arquivos / 1.916 testes, exit 0 (após alinhar a guarda de escopo à rota pessoal de file-states); `pnpm typecheck`, `pnpm lint`, `pnpm build` limpos; `db:generate` sem mudança pendente (migration `0052_striped_famine`, só aditiva).

## Ainda dependem do usuário

- Avaliação visual das telas novas em produção (documento, grupos de label, hierarquia, updates, favoritos, mobile).
- Comparação lado a lado com o Linear real (a extensão do Chrome não conecta).
