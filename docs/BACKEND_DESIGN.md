# circle-api — Design & Contrato de API

Backend do Circle (`circle.nimbloo.ai`). Deriva **fielmente** do frontend real (`ln-dev7/circle`),
a partir da análise exaustiva de `mock-data/`, `store/` e `components/`. Objetivo: substituir o
mock-data client-side por um backend de produção, sem débito, seguindo as convenções Nimbloo
(Spring Boot 4 / Java 25 / GraalVM native).

---

## 1. Arquitetura

```
Browser (@nimbloo.ai)
   │  https://circle.nimbloo.ai
   ▼
Istio gateway-interno (VPN)  ──►  oauth2-proxy (Google SSO, hd=nimbloo.ai)
                                        │  injeta X-Forwarded-Email / X-Forwarded-User
             ┌──────────────────────────┴───────────────────────────┐
             ▼ (/api/*)                                               ▼ (resto)
        circle-api (Spring Boot native)                        circle (Next.js SSR)
             │
             ▼
        Aurora PostgreSQL (schema circle)
```

- **Auth**: o `oauth2-proxy` (fase separada) termina o SSO Google restrito ao domínio `nimbloo.ai`.
  O `circle-api` **não valida token** — confia no header `X-Forwarded-Email` injetado pelo proxy
  (rede fechada por NetworkPolicy; a API nunca é exposta direto). Um `HeaderAuthenticationFilter`
  resolve/auto-provisiona o `User` (por e-mail) e popula o `SecurityContext`. Zero JWT, zero
  reimplementação de login.
- **Roteamento**: mesma origem `circle.nimbloo.ai`; `/api/*` → circle-api, resto → front. Evita
  CORS e cookie cross-site — o front chama `/api/...` relativo.
- **Stack**: Spring Boot 4.0.6, Java 25, GraalVM native (nodepool `default-arm`? → **não**: seguir
  o gêmeo. Backend Java native roda em `default-arm`; ver deploy). JPA + Postgres, Flyway para
  schema, Actuator/Micrometer/Tracing (Brave→Tempo), Sentry manual, springdoc, ProblemDetail RFC 7807.

---

## 2. Decisões (defaults escolhidos — vetar se discordar)

| #   | Decisão                      | Default escolhido                                                                                                                                                                                                          | Racional                                                                |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| D1  | **Multi-tenant?**            | **Single-org** (workspace único Nimbloo). O `orgId` do path (`lndev-ui`) vira um slug fixo configurável; sem tabela de orgs multi-tenant.                                                                                  | Ferramenta interna, um workspace. Evita over-engineering.               |
| D2  | **Identidade**               | Google SSO → e-mail → `User` **auto-provisionado** no 1º acesso (role `Member`; `Admin` por allowlist de e-mails em config).                                                                                               | Sem tela de cadastro; espelha o modelo "workspace do Google Workspace". |
| D3  | **Seed de dados**            | Catálogos (`status`, `priority`, `label`, `health`) **semeados** via Flyway (são fixos no produto). Dados de exemplo (issues/projects/…) **opcionais** por flag `circle.seed-demo=true` (liga em dev/hml, desliga em prd). | Catálogos são o produto; dados reais começam vazios em prd.             |
| D4  | **Reviews (PR review)**      | **Fase 2** — modelar entidade e GETs read-only; a ingestão real (diffs/commits vindos do GitHub) é integração à parte.                                                                                                     | É espelho do GitHub PR; sem fonte de dados própria hoje, seria mock.    |
| D5  | **Agent chat**               | **Stub/Fase 3** — endpoints existem mas retornam resposta canned como hoje; virar LLM real é decisão de produto (qual modelo, custo).                                                                                      | Não é CRUD; é feature de IA que precisa direção sua.                    |
| D6  | **Escopo de Issue por Team** | Adicionar `team_id` **direto** na Issue (hoje o mock deriva via `project.teamId`, e issues sem projeto ficariam órfãs de time). Toda issue pertence a um time.                                                             | Corrige a lacuna de fidelidade; alinha com o Linear real.               |
| D7  | **`identifier` e `rank`**    | Gerados **no servidor**: `identifier = <TEAM_KEY>-<seq>` (contador por time, transacional); `rank` via LexoRank server-side.                                                                                               | Elimina colisão (`LNUI-{random}`) e race do mock.                       |
| D8  | **Paginação**                | Cursor-based opcional (`limit`/`cursor`) em todas as listagens; default sem limite p/ paridade, mas suportado desde já.                                                                                                    | O front não pagina hoje, mas "usado pela empresa" exige teto.           |
| D9  | **Datas relativas**          | `timeAgo`/`timestamp` (`'2h'`, `'12d ago'`) viram `createdAt` **timestamp absoluto**; o "há X" é computado no front.                                                                                                       | Fonte da verdade é o instante, não a string.                            |

> **Preciso do teu OK em D4/D5** (Reviews e Agent como fases posteriores) e **D6** (adicionar `team_id`
> à Issue). O resto são defaults seguros; sigo salvo objeção.

---

## 3. Modelo de dados (schema `circle`, PostgreSQL)

**Catálogos** (semeados, imutáveis pelo usuário comum):

- `status` — `id (slug PK)`, `name`, `color`, `category` (enum: triage|backlog|unstarted|started|completed|canceled), `workflow_order`, `display_order`. (13 registros)
- `priority` — `id (slug PK)`, `name`, `rank` (ordem lógica urgent<high<medium<low<no-priority). (5)
- `label` — `id (slug PK)`, `name`, `color`. (11)
- `health` — `id (slug PK)`, `name`, `color`, `description`. (4)

**Núcleo**:

- `app_user` — `id (uuid PK)`, `slug (unique)`, `name`, `email (unique)`, `avatar_url`, `role` (Member|Admin|Guest|Application), `presence` (online|offline|away), `timezone`, `joined_at`. Auto-provisionado via SSO.
- `team` — `id (slug PK, ex CORE)`, `name`, `icon`, `color`, `issue_seq` (contador p/ identifier).
- `team_member` (N:N) — `team_id`, `user_id`, `joined` (bool viewer). PK composta.
- `project` — `id (uuid PK)`, `name`, `status_id (FK)`, `icon_key`, `percent_complete`, `start_date`, `target_date?`, `lead_id (FK user)`, `priority_id (FK)`, `health_id (FK)`, `team_id (FK)`, `initiative_id (FK?)`, `health_updated_at?`.
- `project_label` (N:N) — `project_id`, `label_id`.
- `issue` — `id (uuid PK)`, `identifier (unique, ex LNUI-701)`, `team_id (FK)`, `title`, `status_id (FK)`, `assignee_id (FK user?)`, `priority_id (FK)`, `created_by_id (FK user)`, `project_id (FK?)`, `cycle_id (FK?)`, `rank (varchar lexorank)`, `due_date?`, `created_at`, `updated_at`.
- `issue_label` (N:N) — `issue_id`, `label_id`.
- `issue_content` (1:1 rich body) — `issue_id (PK/FK)`, `description (jsonb ContentBlock[])`, `milestone?`.
- `issue_relation` — `issue_id`, `related_id`, `kind` (sub|related|blocked_by). Cobre subissues/related/blockedBy.
- `issue_pr_link` — `id`, `issue_id (FK)`, `title`, `status` (open|merged|draft).
- `comment` — `id (uuid PK)`, `issue_id (FK)`, `author_id (FK)`, `body (jsonb ContentBlock[])`, `created_at`.
- `comment_reaction` — `comment_id`, `emoji`, `user_id`. (count = agregação)
- `activity_event` — `id`, `issue_id (FK)`, `actor_id (FK)`, `event` (created|status|label|priority|cycle|blocked|unblocked|related|pr), `text`, `created_at`. (feed = events + comments unificados na leitura)
- `cycle` — `id (uuid PK)`, `number`, `name`, `team_id (FK)`, `status` (planned|upcoming|current|completed), `start_date`, `end_date`, `capacity`. Agregados (`scope`/`started`/`completed`/`scopeDelta`/`successRate`/`burnup`) **computados** on-read, não persistidos.
- `initiative` — `id (uuid PK)`, `slug`, `name`, `description?`, `icon`, `status` (active|planned|completed), `priority_id (FK)`, `owner_id (FK?)`, `target?`, `health_id (FK)`, `created_at`.
- `initiative_project` (N:N) — `initiative_id`, `project_id`.
- `view` — `id (uuid PK)`, `slug`, `name`, `description`, `icon`, `type` (issue|project), `team_id (FK?)`, `owner_id (FK)`, `filter (jsonb ViewFilter)`, `created_at`, `updated_at`.
- `notification` — `id (uuid PK)`, `issue_id (FK)`, `actor_id (FK)`, `recipient_id (FK)`, `type` (comment|mention|assignment|status|reopened|closed|edited|created|upload), `content`, `read`, `created_at`.
- `project_update` — `id (uuid PK)`, `project_id (FK)`, `author_id (FK)`, `health` (on-track|at-risk|off-track), `blocks (jsonb ContentBlock[])`, `created_at`.
- `project_activity` — `id`, `project_id (FK)`, `user_id (FK)`, `text`, `created_at`.
- `project_milestone` — `id`, `project_id (FK)`, `name`, `target_date?`, `completed`.
- `project_resource` — `id`, `project_id (FK)`, `label`, `url`.
- `document_folder` — `id (slug PK)`, `team_id (FK)`, `name`, `icon`.
- `team_document` — `id`, `folder_id (FK)`, `name`, `icon`, `creator_id (FK)`, `pinned`, `created_at`, `updated_at`.
- **Fase 2** `review*` — `review`, `review_file`, `review_commit`, `review_diff_line`, `review_note` (modelagem pronta, ingestão depois).
- **Fase 3** `agent_chat`, `agent_message` (stub).

`ContentBlock[]` e `ViewFilter` persistem como **jsonb** (estruturas ricas, discriminadas por `type`; validadas no DTO).

---

## 4. Convenções de API

- **Base**: `/api/v1`. Erros = `application/problem+json` (RFC 7807) com extension members `code`,
  `traceId`. Sucesso = envelope `{ data, meta? }` (meta p/ paginação).
- **Escopo**: single-org implícito; paths espelham o front onde útil (`/teams/{teamKey}/issues`).
- **Filtro de issues (fidelidade total)**: aceitar **duas formas**:
   1. Params planos multivalorados (semântica "is any of"): `status`, `statusType`, `assignee`
      (inclui `unassigned`), `priority`, `labels`, `project`, `cycle` (inclui `no-cycle`), `category`.
   2. Filtro estruturado `filters=` (JSON `FiltersState` da barra bazza/ui) com operadores
      `is/is not/is any of/is none of` (option), `include/exclude/...` (multiOption). É o que a URL
      do front serializa — parseado 1:1.
- **Agrupamento/ordenação**: `groupBy` (status|assignee|priority|project|none), `orderBy`
  (priority|created|title), `includeCompleted`, `showEmptyGroups`. Resposta agrupada devolve, por
  grupo, `count` (filtrado) **e** `total` (escopo) — os dois números que a UI mostra.
- **Busca**: `q` casa `title` **ou** `identifier` (case-insensitive).
- **LexoRank**: reorder via `PATCH /issues/{id}/rank { beforeId?, afterId? }` → servidor calcula
  `LexoRank.between`; create sem rank → append no fim.
- **Paginação**: `limit` + `cursor` (opaco, base64 do rank/id). `meta.nextCursor` quando há mais.
- **Datas**: entrada/saída ISO-8601; timestamps absolutos (o "2h ago" é do front).

---

## 5. Contrato de endpoints (`/api/v1`)

**Identidade**

- `GET /me` — usuário atual (do header SSO) + times, role, preferências.
- `GET/PUT /me/preferences` — display-settings, sidebar order, theme (Classe B, opcional; jsonb).

**Catálogos** (options dos filtros): `GET /statuses`, `GET /priorities`, `GET /labels`, `GET /health-states`.

**Issues** (núcleo)

- `GET /issues` — lista mestre (todos os filtros/group/sort/q/paginação do §4). `groupBy` → agrupado com count+total.
- `POST /issues` — `{title, description?, statusId, priorityId, teamKey, assigneeId?, projectId?, labelIds[], cycleId?, dueDate?}` → server gera `id`, `identifier`, `rank`, `createdAt`, `createdBy`.
- `GET /issues/{id}` — issue + relações resolvidas.
- `PATCH /issues/{id}` — update parcial (title, statusId, priorityId, assigneeId|null, projectId|null, cycleId, dueDate, description). Cobre updateIssue/Status/Priority/Assignee/Project.
- `DELETE /issues/{id}`.
- `PATCH /issues/{id}/rank` — reorder lexorank.
- `POST /issues/{id}/labels {labelId}` · `DELETE /issues/{id}/labels/{labelId}`.
- `GET /issues/{id}/detail` — description blocks, subIssues, related, blockedBy, prLinks, milestone.
- `GET /issues/{id}/activity` — feed (events + comments com reactions).
- `POST /issues/{id}/comments {body}` · `GET /issues/{id}/comments`.
- `POST/DELETE /comments/{id}/reactions {emoji}`.
- `POST/DELETE /issues/{id}/relations {relatedId, kind}` (sub|related|blocked_by).
- **Agregações**: `GET /issues/aggregate?groupBy=status&segmentBy=priority` (matriz do insights) ·
  `GET /issues/counts?groupBy=...` (count+total por bucket).

**Teams**

- `GET /teams` — `membership`, `identifier`, `sort=name|members|projects`; devolve counts.
- `GET /teams/{teamKey}` (+ `/members`, `/projects`, `/documents`, `/views`).
- `GET /teams/{teamKey}/issues` (atalho escopado, mesmos filtros).

**Projects**

- `GET /projects` — `tab=all|active`, `health`, `priority`, `team`, `initiative`, `sort`, `grouping=team|none`, `includeClosed`.
- `POST /projects` · `GET /projects/{id}` · `PATCH /projects/{id}` · `DELETE /projects/{id}`.
- `GET /projects/{id}/issues`.
- `GET /projects/{id}/progress` — scope/started/completed/percentComplete + breakdowns (assignee/label/cycle com % completo) + série do progress chart.
- `GET /projects/{id}/updates` · `POST /projects/{id}/updates {health, text}`.
- `GET /projects/{id}/activity` · `GET /projects/{id}/milestones` · `GET /projects/{id}/resources`.

**Cycles**

- `GET /teams/{teamKey}/cycles` · `GET /teams/{teamKey}/cycles/active` · `.../upcoming`.
- `GET /cycles/{id}` — inclui agregados computados + `burnup[]`.

**Initiatives**

- `GET /initiatives` — `status`, `priority`, `owner`, `health`.
- `POST /initiatives` · `GET /initiatives/{id}` · `PATCH` · `DELETE`.
- `GET /initiatives/{id}/projects` (+ n/m completos).

**Views**

- `GET /views` (+ por team) · `POST /views` · `GET /views/{id}` · `PATCH` · `DELETE`.
- `GET /views/{id}/results` — aplica o `ViewFilter` salvo a issues **ou** projects.

**Members**

- `GET /members` — `role`, `sort=name|joined|teams`.
- `GET /members/{id}` — profile + issues do membro.

**Inbox / Notifications**

- `GET /inbox` — `read`, `type`, `user`. · `GET /inbox/unread-count`.
- `PATCH /notifications/{id} {read}` · `POST /notifications/read-all`.

**Documents**

- `GET /teams/{teamKey}/documents` (folders + docs) · `POST` · `PATCH` · `DELETE`.

**Reviews (Fase 2, read-only)**: `GET /reviews?list=for-you|created` · `GET /reviews/{id}` (+ files/diff/guide).

**Agent (Fase 3, stub)**: `GET /agent/chats` · `POST /agent/chats` · `POST /agent/chats/{id}/messages`.

---

## 6. Seed / migração

Flyway `V1__catalogs.sql` (status/priority/label/health — os valores exatos da §3 do modelo).
`V2__schema.sql` (tabelas). Seed demo opcional (`circle.seed-demo`) porta os 86 issues / 20 projects /
20 teams / etc. do mock via um `DemoDataSeeder` (`@ConditionalOnProperty`) — resolve os índices de
array do mock para FKs reais, gera identifiers/ranks server-side.

---

## 7. Faseamento do build (TDD em cada fase)

1. **Fundação**: scaffold (pom, config, security header-filter, native, Dockerfile, buildspec, Actuator/Sentry/Tracing), Flyway catálogos, `/me`, catálogos GET. Deploy vazio no ar.
2. **Núcleo Issues + Teams + catálogos**: CRUD issue, filtros/group/sort, detail, comments, activity, rank, agregações. (a maior fatia de valor — é o board)
3. **Projects + Cycles + Initiatives + Views + Members + Inbox + Documents**.
4. **Frontend refactor**: reescrever os stores Zublish→API (fetch), por área, atrás de um `apiClient`.
5. **oauth2-proxy (Google SSO) + deploy do circle-api** (chart, IRSA p/ SM, Aurora, NetworkPolicy).
6. **Fase 2 Reviews** / **Fase 3 Agent** conforme D4/D5.

## 8. Integração frontend

Introduzir `lib/api-client.ts` (fetch tipado, base `/api/v1`). Cada store da Classe A troca o seed
`mock-data` por chamadas assíncronas + estado de loading; os tipos TS já existentes viram a base dos
DTOs (contrato espelhado). Classe C (filtros) já mapeia 1:1 nos query params. Sem mudança de UI.
