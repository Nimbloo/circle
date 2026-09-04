# Épico #25, leva 2 — restos, SLAs e automações, busca, organização, import/export + API + webhooks, roadmap, triage com IA

**Data:** 2026-09-04

**Status:** em execução (6 grupos em paralelo, integrados na branch `danilo/epico-25-leva-2`)

Pedido: "ajusta tudo aí, não deixa nada pra depois". Fecha os restos conscientes da v0.28.0 e
as seis issues restantes do épico (#94, #97, #99, #100, #101, #102). O Linear é o benchmark.

## Contratos compartilhados

- Código em inglês, comentários/commits em pt-BR, Conventional Commits, sem referência a IA.
- Cores por token; toast de sucesso só após a API; otimista + rollback via `apply*`/`updateIssue`.
- Migrations: gerar com `pnpm db:generate` a partir de `db/schema.ts`; SQL aditivo, sem DROP;
  próximo número é `0043`. Na integração eu consolido (um DDL + backfills `--custom`).
  **Sem extensões Postgres** (`unaccent`, `pg_trgm`, `vector`): o RDS compartilhado não as tem
  garantidas; use `to_tsvector('simple', ...)` e lógica em JS quando precisar.
- **Sem CronJob**: tudo lazy (no GET, no boot com advisory lock, ou disparado pelo evento).
- Testes: PGlite para todo serviço em `lib/api/` tocado; jsdom para UI. `pnpm typecheck`,
  `pnpm lint`, `pnpm test` verdes por grupo. Não editar `docs/PENDENCIAS.md` nem o plano.
  Não commitar o dev seam (`CIRCLE_DEV_AUTH_EMAIL`).
- Os seis grupos editam `db/schema.ts`, `lib/api/issues.ts`, `lib/client.ts` e
  `app/globals.css`: mudanças **localizadas** (blocos novos ao final dos arquivos, sem
  reformatar o que não é seu) para o merge ficar simples. Arquivos novos preferidos.
- Bedrock: `lib/api/agent.ts` (`invokeText`, `MODEL_ID`) é o único cliente. Em produção o
  Bedrock está bloqueado até o formulário de use case; **toda** feature com IA precisa de
  fallback honesto (mensagem clara, fila/tela funcionando sem a sugestão).

## Grupo 1 — Restos da v0.28.0 + SLAs e automações (#97)

Restos:

- **Checklist → sub-issue, `checked` regravado:** quando o NodeView do `taskItem` vinculado
  deriva um `checked` diferente do atributo do doc e o editor está editável, escreve o
  atributo (`updateAttributes`) para a projeção `- [x]` acompanhar; sem foco roubado.
- **`deleteIssue` limpa S3:** apaga os objetos dos anexos da issue e dos comentários
  (best-effort, `lib/api/attachments.ts`) antes do cascade.
- **Vídeo no menu "/":** troca o `window.prompt` por um popover inline com input de URL
  (Enter insere, Esc cancela, validação de YouTube/Vimeo/Loom/mp4/webm com erro inline).

SLAs (#97):

- Tabela `team_sla(team_id, priority_id, hours integer, PK(team_id, priority_id))`. Team
  settings → Workflows & automations (hoje placeholder) ganha a seção **SLAs**: uma linha por
  prioridade com horas (vazio = sem SLA).
- Ao criar issue (ou mudar a prioridade) **sem** `dueDate`, aplica `dueDate = agora + horas`
  e marca `issue.sla_applied_at`; activity "applied SLA". Listas e cards: indicador
  "SLA at risk" (< 25% do prazo restante) e "SLA breached" (vencido e não concluído), em
  tokens de warning/destructive; filtro "SLA" (`at risk`/`breached`/`none`).

Automações (#97):

- Tabela `team_automation(id, team_id, name, trigger varchar, action varchar, config jsonb,
enabled bool, position, created_at)`. Triggers: `issue.created_in_triage`,
  `issue.status_changed` (config `toCategory`), `issue.label_added` (config `labelId`),
  `pr.merged` (já existe como fluxo fixo; vira regra visível e editável). Ações:
  `add_label`, `set_status`, `set_priority`, `set_assignee`, `close_sub_issues`.
- Motor: `lib/api/automations.ts` `runAutomations(db, trigger, issue, ctx)` chamado de
  `createIssue`, `updateIssue` (status/label) e do webhook do GitHub; anti-loop (uma
  automação não re-dispara a si mesma na mesma cadeia; profundidade máx. 3); entrada no
  audit log (`lib/api/audit.ts`) e activity "automation: <name>".
- UI em Team settings → Workflows & automations: lista, criar/editar (trigger + ação +
  parâmetros com selects do catálogo), ligar/desligar, excluir. Padrão visual do Linear
  (linhas com toggle à direita).
- Testes: PGlite (SLA aplica dueDate, indicador calculado, três automações de ponta a ponta,
  anti-loop, audit), jsdom (seção SLAs, criar automação, indicadores na linha).

## Grupo 2 — Busca full-text e saved searches (#99)

- **Índice:** colunas geradas `search_vector tsvector` (migration com `GENERATED ALWAYS AS
(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) STORED`; para
  `issue` a descrição vive em `issue_content.description` → usar coluna `issue_content.
search_vector` + `issue.title_vector`, ou uma view materializada simples; escolha o mais
  simples que ranqueie título > descrição) em `issue`/`issue_content`, `project`/
  `project_detail`, `initiative`, `team_document`; índices GIN. Migration DDL em SQL puro
  (`--custom`), aditiva.
- **API:** `GET /api/v1/search?q=&types=issue,project,initiative,document&teamId=&statusId=
&limit=` → `{ groups: [{ type, items: [{ id, identifier?, title, snippet(html seguro com
<mark>), rank, teamId, statusId }] }] }`. Query: `websearch_to_tsquery('simple', q)` com
  prefixo (`q:*`) para termo parcial, `ts_rank_cd` com peso A no título, `ts_headline` para o
  snippet. **Fallback** para `ilike` quando o vetor é nulo/índice ausente ou a query é só
  símbolos. Comentários continuam no `ilike` atual. Meta: < 300 ms com 10k issues (teste
  PGlite com 2k issues semeadas medindo tempo, sem assert frágil — só log).
- **Semântica (opcional):** `lib/api/search-semantic.ts` reordena os 50 primeiros por
  similaridade de embeddings (Bedrock `amazon.titan-embed-text-v2:0` via `lib/api/agent.ts`,
  função nova `embedTexts`), **só** com `CIRCLE_SEARCH_SEMANTIC=1`; cache em memória por
  texto (LRU 5k); qualquer erro → resultado léxico, sem quebrar.
- **UI:** command palette (`components/layout/command-palette.tsx`) e a busca dedicada
  (`search-issues.tsx`) usam a rota nova: resultados agrupados por tipo com snippet
  destacado, chips rápidos de filtro (Type, Team, Status) e o botão **"Save search"**, que
  cria uma View (`lib/api/views.ts`) com o filtro `q` + chips; a View lista pelo mesmo
  endpoint. Atalhos: `Cmd/Ctrl+K` já existe; setas/Enter navegam.
- Testes: PGlite (ranking título > descrição, termo parcial, frase, filtro por time/status,
  fallback `ilike`, saved search reproduz a busca), jsdom (palette agrupada com snippet,
  chips, Save search).

## Grupo 3 — Organização: sub-times, sub-initiatives, desativar membro, convidado (#100)

- **Sub-times:** `team.parent_id` (FK self, índice; guarda de ciclo). Sidebar: sub-times
  aninhados sob o pai (collapsible, mesmo padrão de `nav-teams.tsx`); breadcrumb `Pai › Sub`;
  filtros e listas do time pai **incluem** os filhos (`teamIds` expandido no servidor em
  `listIssues`/`listProjects`); Team settings → General ganha "Parent team".
- **Sub-initiatives:** `initiative.parent_id` (FK self, índice, ciclo); detalhe da initiative
  mostra "Sub-initiatives" com rollup de projetos (contagem e progresso agregando os filhos);
  breadcrumb; picker "Parent initiative" nas propriedades.
- **Desativar membro:** `app_user.deactivated_at`. Members → menu do membro: "Deactivate"
  (admin; confirmação inline) remove de todos os times, mantém histórico (activity, autoria),
  bloqueia login (`lib/api/login-gate.ts`/`auth.ts` recusam com mensagem "conta desativada"),
  some dos seletores de assignee/lead e de `@`; "Reactivate" reverte. Filtro "Show
  deactivated" na lista de membros. Não excluir usuário.
- **Convidado (`role = 'Guest'`):** só enxerga times em que é membro e os projetos desses
  times; `workspace`, `listIssues`, `listProjects`, `initiatives`, `views`, `members`,
  `search` (se existir) e o detalhe de issue/projeto filtram no servidor (403 fora do escopo);
  sidebar esconde o que não é dele; convites (`lib/api/invites.ts`) aceitam papel `Guest`.
  **Teste de autorização por rota** (`test/guest-scope.test.ts`): cada rota de leitura com um
  guest fora do time devolve 403/lista vazia.
- Testes: PGlite (ciclo em team/initiative, listagem do pai inclui filhos, rollup de
  sub-initiative, desativar bloqueia login e remove dos times, guest scope por rota), jsdom
  (sidebar aninhada, sub-initiatives no detalhe, Deactivate com confirmação).

## Grupo 4 — Import/export, API pública e webhooks (#101)

- **Import:** `POST /api/v1/import/preview` (multipart CSV; `source = csv|linear|jira`) →
  detecta colunas, propõe mapeamento (status/prioridade/assignee por nome → catálogo/membros,
  sem match = "criar label"/"deixar vazio"), devolve amostra de 20 linhas e avisos;
  `POST /api/v1/import/commit` (mapeamento confirmado) cria issues em lote (rank, labels,
  sub-issues por coluna `parent` quando houver) e grava `issue_import(source, external_id,
issue_id, PK(source, external_id))` para **re-import não duplicar** (atualiza título/
  status). Presets de colunas do export do Linear e do Jira. UI: Settings → Import/Export com
  wizard (upload → mapeamento → resumo → resultado), padrão Linear.
- **Export:** o CSV por time já existe (`app/api/v1/issues/export`); ganha `format=json`
  (issues com labels, assignees, parent, comments) e botão em Settings → Import/Export.
- **API pública:** tabela `api_token(id, name, token_hash, prefix, scopes text[], created_by,
created_at, last_used_at, revoked_at)`; token `circle_<random>` mostrado uma vez;
  `Authorization: Bearer` validado em `lib/api/public-auth.ts`; escopos `read`/`write`.
  Rotas `app/api/public/v1/{issues,projects,teams,statuses,labels}` (GET lista/detalhe, POST e
  PATCH em issues/projects com `write`), respostas com o mesmo DTO da API interna, erros
  RFC 7807 como hoje; `GET /api/public/v1/openapi.json` gerado por um objeto estático
  tipado (sem lib nova). Sem rate limit in-app (é na borda). UI: Settings → API tokens
  (criar com escopos, listar, revogar). `middleware.ts` libera `/api/public/*` do gate de
  sessão (a auth é o token).
- **Webhooks de saída:** tabelas `webhook(id, url, secret, events text[], enabled, created_by,
created_at)` e `webhook_delivery(id, webhook_id, event, payload jsonb, status, attempts,
next_attempt_at, response_code, last_error, created_at)`. `lib/api/events.ts` publica →
  `lib/api/webhooks.ts` enfileira uma delivery por webhook assinante (`issue.created/updated/
deleted`, `project.*`, `comment.created`) e dispara **inline best-effort** com timeout 5 s;
  falha → backoff (1 m, 5 m, 30 m, 2 h, 24 h; 5 tentativas) processado **lazy** (sweep no boot
  e a cada publish, com advisory lock). Assinatura `X-Circle-Signature: sha256=<HMAC do
body>` + `X-Circle-Event` + `X-Circle-Delivery`. UI: Settings → Webhooks (criar, eventos,
  ligar/desligar, últimas entregas com status e "Redeliver").
- Testes: PGlite (preview mapeia, commit idempotente em re-import, JSON export, token
  autentica e respeita escopo, webhook assina e reenvia após falha), jsdom (wizard de import,
  tokens, webhooks).

## Grupo 5 — Roadmap (#102)

- **Tela Roadmap** (`/[orgId]/roadmap`, item na sidebar do workspace abaixo de Initiatives):
  timeline (reusa `projects-timeline.tsx`) agrupando projetos por initiative (sem initiative
  no fim), com marcos (milestones) como losangos na barra, cabeçalho por initiative com
  progresso agregado, zoom mês/trimestre/ano, Display com "Show completed" e ordenação.
- **Dependências entre projetos:** tabela `project_dependency(project_id, depends_on_id,
created_at, PK)`, guarda de ciclo; propriedade "Depends on" no painel do projeto (picker);
  no Roadmap, seta SVG entre as barras (tokens) e badge "Blocked: <dep> late" quando a
  dependência tem `targetDate` posterior ao `startDate` do dependente ou está atrasada
  (target passado e não concluída). Filtro "Show dependencies".
- **Histórico de progresso:** tabela `project_snapshot(project_id, date, scope, completed,
started, PK(project_id, date))`, upsert **lazy** no GET do projeto/roadmap e no boot (mesmo
  padrão de `cycle_snapshot`); gráfico de linha (SVG próprio, sem lib) no overview do projeto
  e no detalhe da initiative (agregado), com tooltip por dia.
- Testes: PGlite (dependência com ciclo 400, atraso calculado, snapshot upsert idempotente,
  agregado por initiative), jsdom (roadmap agrupado, seta e alerta de dependência, gráfico
  com 2+ pontos).

## Grupo 6 — Triage com IA (#94)

- Tabela `issue_triage_suggestion(issue_id PK, payload jsonb, created_at, applied_at,
dismissed_at, source varchar 'ai'|'heuristic')`.
- Quando uma issue entra em Triage (create com status de categoria `triage`, ou status muda
  para lá), `lib/api/triage.ts` gera a sugestão **assíncrona** (fire-and-forget após o
  commit; e lazy no GET da fila de Triage para as que não têm): prompt com catálogo do
  workspace (times com descrição, prioridades, labels) + títulos das últimas 200 issues do
  time → JSON `{ teamId, priorityId, labelIds, duplicates: [{ issueId, reason }] , summary }`
  via `invokeText` com parse defensivo. **Sem Bedrock** (erro `ResourceNotFound`/credencial):
  gera sugestão `heuristic` só com duplicatas por similaridade de tokens (Jaccard sobre
  título normalizado ≥ 0,5, em JS) e a tela mostra "AI triage unavailable — showing
  duplicates only" quando há duplicatas, ou nada.
- UI na tela de Triage (`AllIssues categories={['triage']}`) e no painel da issue em triage:
  card "Suggested" com time, prioridade, labels e possíveis duplicatas (link + motivo),
  botões **Accept** (aplica os quatro campos, move para o 1º status `unstarted` do time
  escolhido, cria relação `related` com as duplicatas, activity "triaged with suggestion",
  `applied_at`) e **Edit** (abre os seletores pré-preenchidos) e **Dismiss**. Toast só após a
  API. Latência alvo ≤ 5 s: a fila renderiza imediatamente e o card aparece quando a sugestão
  chega (evento realtime `issue` updated).
- Testes: PGlite (sugestão heurística de duplicata, accept aplica campos/relacionamento/
  activity, dismiss, geração lazy no GET; `invokeText` mockado devolvendo JSON válido e
  inválido), jsdom (card, Accept, Edit).

## Integração (eu)

Merge dos seis, migrations consolidadas (`0043` DDL + backfills custom), `pnpm install
--frozen-lockfile`, typecheck/lint/test/build, smoke no Chrome (SLA e automação, busca
agrupada e saved search, sub-time e guest, import CSV e token público e webhook, roadmap com
dependência, triage com sugestão heurística), PR para `develop` (Closes #94 #97 #99 #100
#101 #102), release MINOR, verificação em produção.
