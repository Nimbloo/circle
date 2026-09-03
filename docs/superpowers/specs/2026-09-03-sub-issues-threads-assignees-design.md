# Sub-issues, checklists, threads + anexos, múltiplos responsáveis, edição inline nas listas

**Data:** 2026-09-03

**Status:** em execução (4 grupos em paralelo, integrados na branch
`danilo/sub-issues-threads-assignees`)

Pedido: "1, 2, 3 e tasks. foca em tudo nisso" + "em algumas seções eu não consigo alterar pela
lista (tabela), faça essa checagem". Issues: #95 (sub-issues), #98 (threads e anexos),
#96 (múltiplos responsáveis). "Tasks" = checklist do editor com paridade Linear e conversão em
sub-issue (o Linear não tem uma feature chamada Tasks; conferido em docs e changelog).
O Linear é o benchmark; onde ele diverge do pedido (múltiplos assignees), o pedido vence.

## Contratos compartilhados

- Código em inglês, comentários/commits em pt-BR, Conventional Commits, sem referência a IA.
- Cores por token; toast de sucesso só após a API; otimista + rollback via `apply*`/`updateIssue`.
- Migrations: gerar com `pnpm db:generate` a partir de `db/schema.ts`; SQL aditivo, sem DROP de
  dado; próximo número é `0040`. Na integração eu consolido (um arquivo por grupo, renumerado).
- Testes: PGlite para todo serviço em `lib/api/` tocado; jsdom (`// @vitest-environment jsdom` +
  `import './setup-dom'`) para UI. `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes por grupo.
- Não editar `docs/PENDENCIAS.md` nem o plano. Não commitar o dev seam (`CIRCLE_DEV_AUTH_EMAIL`).
- Contratos entre grupos (definidos aqui, implementados pelo grupo dono):
   - `CreateIssueInput.parentId?: string` e `IssueDto.parentId: string | null` (G1).
   - `api.issues.create({ ..., parentId })` devolve o `IssueDto` da filha (G1).
   - `IssueDto.assignees: UserRef[]` (G3) — G1/G2/G4 não dependem dele.
   - Anexos usam a rota nova `POST /api/v1/attachments` (G2); o editor continua em `/uploads`.

## Grupo 1 — Sub-issues (#95)

Hoje a hierarquia é `issue_relation kind='sub'` sem pai único, sem guarda de ciclo, e o detalhe
resolve as filhas cruzando com o `issues-store` (filha fora do store some). Passa a existir pai
canônico.

- **Schema:** `issue.parent_id varchar(36) NULL REFERENCES issue(id)` + índice. Migration
  aditiva + **backfill** a partir de `issue_relation` com `kind='sub'` (`issueId` = pai,
  `relatedId` = filha; em conflito de mais de um pai, fica o mais antigo). As linhas `sub` de
  `issue_relation` deixam de ser escritas; leitura passa a vir de `parent_id`. Guarda de ciclo
  (ancestral não pode virar filho) e uma issue não pode ser pai de si mesma. Profundidade
  livre; rollup (`subIssueCount`/`subIssueDoneCount`) continua de **filhas diretas**, agora por
  uma query `GROUP BY parent_id` (substitui as duas queries atuais em `assemble()`).
- **API (aditiva):** `IssueDto.parentId`; `IssueDetailDto` ganha `parent: { id, identifier,
title } | null` e `subIssues: { id, identifier, title, statusId, assignee }[]` (substitui a
  dependência do store; `subIssueIds` continua por compatibilidade). `CreateIssueInput.parentId`
  cria já vinculada (atômico): herda `teamId`, `priorityId`, `projectId` do pai quando não
  informados; `cycleId` do pai se o cycle estiver ativo; labels **não** herdam; assignee herda
  só se o criador é o assignee do pai. `UpdateIssueInput.parentId?: string | null` (mover para
  outro pai / remover pai), com activity `parent` ("set parent to ENG-12" / "removed parent").
  `addRelation(kind='sub')` e `removeRelation(kind='sub')` passam a delegar para `parentId`
  (compatibilidade do cliente antigo). `deleteIssue` de um pai **desvincula** as filhas
  (`parent_id = NULL`) em vez de deixar relação órfã.
- **Detalhe (`issue-details.tsx`):** bloco "Sub-issues" lê `detail.subIssues`; contagem
  `done/total` com `SubIssueProgress`; criar inline (input com Enter cria e mantém foco;
  colar várias linhas cria uma sub-issue por linha; Esc cancela); reordenar não entra.
  "Link existing issue" vira "Add existing issue" e seta `parentId` na escolhida (picker com
  busca por identifier/título; candidatos do store **e** busca no servidor por `q`).
  Propriedade **Parent** na sidebar de propriedades: chip com identifier + título e menu
  "Change parent" / "Remove parent". Menu `...` do header: "Convert to sub-issue of…".
- **Header/breadcrumb (`header-nav.tsx`):** `Team › [Cycle ›] PARENT-ID › CHILD-ID Title`, com
  o segmento do pai linkando para ele. O header deixa de depender do store para resolver a
  issue atual: usa `detail` (mesma fonte da página).
- **Listas:** volta o toggle **"Show sub-issues"** no `display-settings-store` (default `true`;
  sincronizado com o servidor como as demais chaves). Com `false`, listas e board escondem
  issues com `parentId`. Com `true`, a linha da sub-issue mostra um chip discreto com o
  identifier do pai antes do título (como o Linear em views flat). Filtro novo **"Sub-issues"**
  em `issue-filter-columns.tsx`: `All` / `Top-level only` / `Only sub-issues` /
  `With sub-issues`.
- **Team settings → Workflow:** dois toggles (`team.auto_close_parent`,
  `team.auto_close_children`, default `false`): concluir todas as filhas conclui o pai; concluir
  o pai conclui as filhas restantes. Aplicado em `updateIssue` quando o status muda de
  categoria, com activity e evento realtime.
- **Testes:** PGlite (create com `parentId` herdando propriedades, mover/remover pai, ciclo
  rejeitado 400, backfill idempotente, rollup por `GROUP BY`, delete do pai desvincula,
  auto-close nos dois sentidos); jsdom (criar sub-issue inline com Enter e por colar 3 linhas,
  breadcrumb com pai, chip do pai na linha, toggle "Show sub-issues" escondendo filhas).

## Grupo 2 — Comentários em thread + anexos (#98)

Threads já existem em 1 nível (`comment.parent_id`, resposta só em raiz). Falta o que o Linear
mostra: colapso, resolução, "editado", converter em sub-issue, e anexos (hoje não existe nada).

- **Schema:** `comment.updated_at timestamptz NULL`, `comment.resolved_at timestamptz NULL`,
  `comment.resolved_by_id varchar(36) NULL REFERENCES app_user(id)`. Tabela
  `attachment(id, issue_id FK cascade, comment_id varchar(36) NULL, uploaded_by_id FK app_user,
url text, file_name varchar(255), content_type varchar(127), size integer, created_at)`;
  índices por `issue_id` e `comment_id`.
- **Threads (UI `activity-feed.tsx` + `comment-composer.tsx`):** respostas colapsadas por padrão
  quando > 2, com linha "N replies · último há X" que expande; botão de reply no hover de
  qualquer comentário da thread (sempre ancora na raiz, como hoje no servidor); "Resolve
  thread" / "Reopen" no menu `...` da raiz (raiz resolvida fica compacta com check verde;
  respostas escondidas até expandir); "edited" ao lado do horário quando `updatedAt` existe;
  "Convert to sub-issue" no menu `...` cria issue (`api.issues.create({ parentId: issueId,
title: primeira linha do corpo, description: resto })`) e anexa ao comentário um chip
  `issueRef` — sem depender do G1 estar mergeado: usa o contrato `parentId` da spec e o teste
  mocka `api.issues.create`. Composer com Cmd/Ctrl+Enter já existe; ganha o **clipe** (input de
  arquivo), **Ctrl+Shift+A**, arrastar e colar arquivo.
- **Notificações:** reply notifica autor da raiz **e** quem já respondeu na thread (dedupe, sem
  notificar o próprio ator); e-mail de comentário passa a incluir o texto da raiz como contexto
  quando é reply (template em `lib/api/integrations/email-templates.ts`).
- **Anexos — API:** `POST /api/v1/attachments` multipart (`file`, `issueId`, `commentId?`),
  até **25 MB**, allow-list por MIME e extensão: imagens raster, `pdf`, `txt/md/csv/json`,
  `zip`, `mp4/webm`, `docx/xlsx/pptx`; bloqueia `svg/html/js` e qualquer executável. Sobe para o
  mesmo bucket/CDN de `lib/api/s3-assets.ts` com chave `uploads/<uuid>.<ext>` (prefixo já
  liberado na IAM de prd) e `Content-Disposition: attachment; filename=...` no objeto para
  não-imagens. `GET /api/v1/issues/{id}/attachments`, `DELETE /api/v1/attachments/{id}`
  (uploader ou admin; remove do S3 em best-effort). `IssueDetailDto.attachments[]`;
  `CommentDto.attachments[]`. Evento realtime reutiliza `entity:'comment'` para anexos de
  comentário e `entity:'issue'` para anexos da issue.
- **Anexos — UI:** seção **"Attachments"** no detalhe (abaixo da descrição, acima de
  sub-issues): grade de chips com ícone por tipo, nome, tamanho e miniatura para imagem; botão
  "Add attachment", drag-and-drop na seção e colar arquivo na descrição vai para a seção quando
  não é imagem (imagem continua indo para o editor). Anexos de comentário aparecem sob o corpo
  do comentário. Remoção pelo uploader/admin com confirmação inline.
- **Testes:** PGlite (resolve/reopen com permissão, `updated_at` no PATCH, reply notifica
  participantes sem duplicar, anexo aceito/recusado por tipo e tamanho, delete por
  uploader/admin, cascade no delete da issue); jsdom (colapso "N replies", resolver thread,
  chip "edited", composer com anexo mostrando chip antes de enviar, seção Attachments).

## Grupo 3 — Múltiplos responsáveis (#96)

O Linear é single-assignee por design; o pedido é ter mais de um. Modelo: `assigneeId`
continua como **principal** (compatibilidade de todo o contrato atual) e uma tabela guarda o
conjunto completo.

- **Schema:** `issue_assignee(issue_id FK cascade, user_id FK, created_at, PK(issue_id,
user_id))` + índice por `user_id`. Backfill: uma linha por `issue.assignee_id` não nulo.
- **API (aditiva):** `IssueDto.assignees: UserRef[]` (principal primeiro, depois por ordem de
  adição). `UpdateIssueInput.assigneeIds?: string[]` substitui o conjunto: `assigneeId =
assigneeIds[0] ?? null`, junção = todos. `assigneeId` sozinho continua aceito (vira conjunto
  de 1, preservando os demais? **Não**: `assigneeId` sozinho substitui o principal e mantém os
  colaboradores; `assigneeIds` substitui tudo). `CreateIssueInput.assigneeIds?`. Filtro servidor
  `assigneeId`/`assigneeMe`/`unassigned` consideram a junção. Notificação de atribuição e
  auto-subscribe para **cada** novo assignee; activity "added assignee X" / "removed assignee X".
- **UI:** `assignee-user.tsx` vira multi-select (checkbox por membro, "Assign to me" toggla o
  próprio, busca) mantendo o atalho atual; nas linhas e cards, **avatares em pilha** (até 3 +
  "+N"), tooltip com nomes; sidebar de propriedades lista todos. `assignee-selector.tsx` do modal
  de criação idem. Filtro "Assignee" (`issue-filter-columns.tsx`) casa com qualquer assignee;
  grouping por assignee coloca a issue no grupo do **principal** (evita duplicar linha). **My
  issues › Assigned** passa a incluir onde sou colaborador e usa o filtro servidor
  (`assigneeMe`) em vez de filtrar o store no cliente. Export CSV ganha coluna `assignees`.
- **Testes:** PGlite (set/replace/clear, backfill, filtros e `assigneeMe` por junção,
  notificação para cada novo, principal derivado); jsdom (multi-select, pilha de avatares,
  My issues com colaborador).

## Grupo 4 — Checklists no editor ("tasks") + edição inline nas listas

### Checklists (paridade Linear)

Task list já existe (Tiptap `TaskList`/`TaskItem nested`, slash "Task list", `[ ] `, `docToText`
com `- [ ]`). Falta:

- **Atalhos:** `Mod-Shift-7` alterna task list; `Alt-Enter` (e `Mod-Enter`) alterna o check do
  item atual; `Tab`/`Shift-Tab` aninham (já do TaskItem — garantir e testar).
- **Colar:** texto com linhas `- [ ]`/`- [x]`/`* [ ]` (ou `☐`/`☑` do Google Docs) vira task
  list; `- ` vira bullet, `1. ` vira numerada. Paste rule só quando o clipboard é texto puro sem
  HTML de editor.
- **Converter item em sub-issue:** `BlockEditor` ganha `context?: { issueId, teamId,
projectId? }`. Com contexto, cada `taskItem` (NodeView React, padrão `issue-ref-chip.tsx`)
  mostra no hover um botão "Create sub-issue" (e `Mod-Shift-O` com o cursor no item) que chama
  `api.issues.create({ teamId, projectId, parentId: issueId, title: texto do item })` e
  substitui o conteúdo do item por um chip `issueRef`; o `checked` do item passa a refletir o
  status da sub-issue (completed) e fica read-only. Força o flush do save antes de criar.
  Teste mocka `api.issues.create` (contrato do G1).
- **Progresso:** nada nas listas (o Linear não mostra). Só o rollup de sub-issues já existente.
- **Testes jsdom:** atalhos, paste de markdown/Google Docs, conversão em sub-issue com chip.

### Edição inline nas listas (checagem pedida)

Preenchido a partir da auditoria (ver plano, Task 4b): cada superfície de lista/board em que a
troca de status, prioridade, assignee, labels, projeto, cycle, due date ou estimate **não
funciona** ganha correção mínima na causa raiz (seletor read-only, `onChange` no-op, issue fora
do `issues-store` fazendo `updateIssue` retornar cedo, lista alimentada por fetch local sem
splice). Regra: toda linha de issue, em qualquer seção, edita pelos mesmos seletores do team
issues, com otimista + rollback + toast só após a API. Teste jsdom por superfície corrigida.

## Integração (eu)

Merge dos quatro, migrations consolidadas (`0040` sub-issues, `0041` threads/anexos, `0042`
assignees), `pnpm install --frozen-lockfile`, typecheck/lint/test/build, smoke no Chrome
(sub-issue inline e por colar, breadcrumb, Show sub-issues, thread colapsada/resolvida, anexo
em comentário e na issue, multi-assignee com pilha, checklist → sub-issue, edição inline nas
seções corrigidas), PR para `develop` (Closes #95 #98 #96), release MINOR, verificação em
produção (migrations, health, upload de anexo real).
