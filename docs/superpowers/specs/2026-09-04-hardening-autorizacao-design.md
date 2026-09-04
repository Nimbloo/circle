# Hardening: autorização, identidade e os bugs achados na auditoria da v0.29.0

**Data:** 2026-09-04

**Status:** em execução (3 grupos em paralelo, integrados na branch `danilo/hardening-autorizacao`)

Pedido: "resolve tudo", depois da auditoria completa da v0.29.0 (três frentes, 16 cenários de
autorização provados rodando código). Isto é **correção de segurança**, não feature: sai numa
release própria, antes de qualquer coisa nova.

## Diagnóstico que orienta o desenho

A causa é única: **o escopo mora nos route handlers e só nas leituras**. Dos 192 handlers, 29
verificam escopo e **nenhuma escrita interna verifica**. Os serviços não conhecem escopo —
exceção: `lib/api/documents.ts:81-90`, que é o modelo a copiar.

Corrigir rota a rota não basta: a próxima rota nasce furada. Por isso o desenho é
**gate na camada de serviço + teste-guarda que falha quando um handler novo não verifica**.

## Contratos compartilhados

- Código em inglês, comentários/commits em pt-BR, Conventional Commits, sem citar IA.
- **Propriedade de arquivo é obrigatória** (abaixo). Não edite arquivo de outro grupo: se
  precisar de algo dele, peça no relatório e siga com o resto.
- Toda correção de autorização precisa de **teste que falharia antes** (PGlite, padrão de
  `test/guest-scope.test.ts`). Sem teste, a correção não conta.
- Migrations: `pnpm db:generate`; a próxima é `0046`. Aditivas, sem DROP.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes por grupo. Não commitar o dev seam.
- Não editar `docs/PENDENCIAS.md` nem o plano.
- **Nada de mudar contrato de resposta**: 403 para fora de escopo, 404 só quando não existe.

## Grupo 1 — Escopo de verdade (o gate estrutural)

**Arquivos seus:** `lib/api/scope.ts`, `lib/api/issues.ts`, `lib/api/projects.ts`,
`lib/api/initiatives.ts`, `lib/api/views.ts`, `lib/api/import.ts`, `lib/api/issue-detail.ts`,
`lib/api/project-detail.ts`, `lib/api/triage.ts`, e **todas** as rotas sob
`app/api/v1/{issues,projects,initiatives,views,import}/**`. Mais `test/guest-scope.test.ts` e o
teste-guarda novo.

1. **Gate na camada de serviço.** Em `lib/api/scope.ts`, além dos asserts atuais, criar
   `assertCanWriteTeam(db, actorEmail, teamId)` e `assertCanWriteIssue/Project(db, actorEmail,
id)`, resolvendo o escopo internamente (uma query, memoizável por request). Chamar **dentro
   dos serviços** (`createIssue`, `updateIssue`, `deleteIssue`, `addRelation`, `addComment`,
   `addLabel`, `setRank`, `subscribe`, `updateProject`, `deleteProject`, milestones, resources,
   updates, `commitImport`, `createView`, triagem `accept`/`dismiss`), não só nas rotas. Os
   serviços já recebem `actorEmail` na maioria dos casos; onde não recebem, adicione o
   parâmetro (mudança interna, sem contrato público).
2. **Fechar o que a auditoria provou:** criar issue em time alheio (inclusive **herdando o time
   via `parentId`** — validar o time efetivo, não só o corpo); `PATCH`/`DELETE` de issue e de
   projeto sem escopo; **mover projeto ou issue para o próprio time** (validar origem **e**
   destino — é a escalação que anula tudo); comentar e ler `activity` de issue alheia; as 11
   sub-rotas de `issues/[id]` sem verificação; `relations` (validar as duas pontas);
   `subscription`; `rank`; `labels`; `milestones`/`resources`/`updates` de projeto (que hoje
   ignoram o `{id}` da URL e editam por id global); `PUT /projects/{id}/dependencies` (validar
   também os alvos); `POST /import/commit`; `POST /views` (validar existência **e** escopo do
   `teamId`).
3. **`deleteIssue` limpa `issue_import`** (hoje estoura chave estrangeira em issue importada).
4. **Teste-guarda de escrita** (`test/route-scope-guard.test.ts`): varre `app/api/v1/**/route.ts`,
   e para cada handler `POST|PATCH|PUT|DELETE` exige que o arquivo **ou** o serviço chamado
   verifique escopo; lista de exceções explícita e comentada (dado do próprio usuário, catálogo
   global). Corrija os dois pontos cegos do guarda existente (`test/route-auth-guard.test.ts`):
   o falso positivo do ternário e a forma `export const GET = handler`.

## Grupo 2 — Identidade, credenciais e integrações

**Arquivos seus:** `lib/api/users.ts`, `lib/api/members.ts`, `lib/api/auth.ts`,
`lib/api/http.ts`, `lib/api/api-tokens.ts`, `lib/api/webhooks.ts`, `lib/api/teams.ts`,
`auth.config.ts`, e as rotas sob `app/api/v1/{api-tokens,webhooks,teams,members,attachments}/**`.

1. **Desligamento que desliga.** Em `lib/api/users.ts` (resolução do ator), recusar com 403
   quem tem `deactivated_at` — fecha de uma vez a sessão viva, o caminho Bearer e o token de
   máquina. Efeito colateral a tratar: hoje desativar **amplia** o alcance (remove dos times mas
   mantém papel `Member`, que é escopo irrestrito) — com o 403 isso morre; ainda assim,
   rebaixe o papel na desativação para não depender de um único ponto.
2. **`listMembers` ganha `includeDeactivated` (default `false`)**; a UI que precisa dos
   desativados passa a pedir explicitamente. Validar `deactivated_at` ao aceitar
   `assigneeId`/`assigneeIds`/`leadId` (400 com mensagem clara).
3. **Administrador obrigatório** nos seis handlers de webhook e nos três de token de API. Token
   revogado/desativado já é recusado; manter.
4. **Anti-SSRF no webhook:** allow-list de destino (bloquear loopback, `10.`, `172.16/12`,
   `192.168`, `169.254.0.0/16`, `.svc.cluster.local`, `.internal`), resolver o host antes de
   gravar, `redirect: 'manual'` no disparo, e não devolver corpo da resposta remota.
5. **Fail-open:** `GET /teams` e `GET /teams/{key}` usam `emailFromRequest` e, sem sessão,
   caem em escopo irrestrito. Trocar por `requireEmail`.
6. **`deleteTeam` limpa `team_sla` e `team_automation`** (hoje estoura chave estrangeira, e como
   a automação padrão é semeada sozinha, quase todo time é indelével). Incluir as duas na guarda
   de 409 se fizer sentido.
7. **Anexo:** checar `Content-Length` **antes** de `req.formData()` (hoje o corpo inteiro é
   materializado antes do limite de 25 MB, e o comentário no código afirma o contrário);
   corrigir o comentário. Aplicar o mesmo cuidado em `lib/api/uploads.ts`.
8. **Papel:** impedir que o último administrador se rebaixe (a auto-desativação já é bloqueada).

## Grupo 3 — Comportamento, dados e observabilidade

**Arquivos seus:** `lib/sla.ts`, `lib/api/slas.ts`, `lib/api/automations.ts`,
`lib/api/search.ts`, `lib/api/search-semantic.ts`, `lib/api/triage.ts` (só a parte de
concorrência/geração), `lib/api/cycles.ts`, `lib/api/project-snapshots.ts`,
`lib/sentry-options.ts`, `instrumentation.ts`, `db/schema.ts` (bloco de SLA), e os componentes
de UI correspondentes. **Não** edite `lib/api/issues.ts` — se precisar de mudança lá, resolva
dentro do seu próprio serviço (ex.: `try/catch` no topo de `runAutomations`, não no chamador).

1. **SLA que respeita a hora.** Coluna nova `issue.sla_due_at timestamp` (migration aditiva) é
   o vencimento real; `due_date` continua a data humana. `slaState` passa a usar o timestamp, e
   "at risk" a considerar a janela contratada, não a arredondada. Hoje 1 h, 4 h e 12 h produzem
   o mesmo prazo. Trocar prioridade **não** deve apagar um SLA já estourado: registre o novo
   prazo sem zerar o histórico (ou mantenha o vencimento mais apertado; decida e documente).
2. **Busca com acento.** Normalizar diacríticos nas duas pontas: no índice (expressão da
   coluna gerada — migration nova, sem extensão Postgres, usando `translate`) e na consulta e no
   fallback. A triagem já resolve isso em `lib/api/triage.ts` — reaproveite a ideia.
3. **Automações:** `try/catch` no topo de `runAutomations` (hoje uma falha antes do loop derruba
   o PATCH inteiro); a regra padrão **não ressuscita** depois de apagada (marca no time ou
   unique em `(teamId, trigger)`); `set_priority` recalcula SLA como a UI faz.
4. **Webhooks — starvation e imposto:** o sweep ignora entregas de webhook desabilitado (hoje
   50 entregas presas matam o retry de todos) e sai do caminho de todo `publish` (só quando o
   evento criou entrega). **Coordene com o Grupo 2**, que também mexe em `webhooks.ts`: você
   entrega **apenas o SQL do sweep**, num patch pequeno e isolado, e diz isso no relatório.
5. **Triagem:** dedupe de geração em voo por issue (mapa em memória) e não ressuscitar card já
   descartado (o upsert hoje zera `dismissed_at`); debounce no reload da fila.
6. **Gráficos honestos:** o burn-up de ciclo não inventa reta entre medições — lacuna vira
   lacuna (ou ponto explícito de "sem medição"); o gráfico de projeto plota por **data**, não
   por índice.
7. **Observabilidade:** hoje **nenhum erro da API chega ao Sentry** (o handler genérico converte
   tudo antes do gancho). Ligar `captureConsoleIntegration({ levels: ['error'] })` e capturar
   explicitamente no `handle()` os 5xx. É o item que torna todo o resto visível.
8. **Migration segura:** `migrate()` roda na pool com `statement_timeout` de 15 s — migrar pela
   conexão dedicada do advisory lock, que já existe e não tem timeout.

## Integração (eu)

Merge dos três, migrations consolidadas, typecheck/lint/test/build, smoke no Chrome com foco em
regressão (convidado não vê nem escreve fora do time; desativado perde acesso; token e webhook
só para admin; SLA com hora; busca com acento), PR para `develop`, release **PATCH** se nada
mudar de contrato visível, verificação em produção.
