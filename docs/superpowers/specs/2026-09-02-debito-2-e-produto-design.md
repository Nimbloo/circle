# Débito restante (1–7) e produto: cycles, editor, datas de initiative, DnD de projetos

**Data:** 2026-09-02

**Status:** concluído (integrado em `danilo/debt-2-e-produto`, PR para `develop` em 2026-09-02)

Pedido: "vai do 1 ao 7, tem que deixar tudo impecável; cycles, editor, datas reais em
initiatives, isso tudo tem que ser tocado". Sem decisão pendente do usuário: as decisões
de produto abaixo são minhas e ficam registradas aqui. O Linear é o benchmark.

## Contratos compartilhados

- Código em inglês, comentários/commits em pt-BR, Conventional Commits, sem referência a IA.
- Cores por token; toast de sucesso só após a API; splice/rollback como no `issues-store`
  (use os `apply*` do `workspace-store`: `applyProject`, `applyInitiative`, `applyCycle`,
  `applyTeam`, `applyTeamMembers`…).
- **Migrations:** gere normalmente com `pnpm db:generate` (os testes PGlite precisam). Na
  integração eu consolido as migrations dos grupos numa só (`0036`), então: SQL de
  **backfill** custom vai num arquivo separado `db/migrations/0036_backfill_<slug>.sql`
  registrado no journal (drizzle `--custom`) para eu conseguir carregar.
- Não editar `docs/PENDENCIAS.md` nem o plano (integrador cuida).

## Grupo 1 — Débito 1–7 (miúdos) + item 5 (contrato aditivo)

1. Apagar código morto em `data/reviews.ts` (`getReviewFileDiff`, `getReviewGuide`, seeds e
   o gerador determinístico); ajustar tipos que sobrarem; refazer o cabeçalho de
   `lib/adapters-reviews.ts` (o backend JÁ modela files/commits/guide).
2. Perfil de membro (`components/common/members/member-profile.tsx` +
   `components/layout/headers/profile/header.tsx`) passa a usar `DetailSidePanel kind="member"`
   (adicionar `member` ao `DetailPanelKind` do `store/detail-panel-store.ts` e ao schema de
   `layout.detailPanels` em `lib/api/settings.ts`); remover `'hidden'` do `RightPanelType`.
3. Painel de issue dentro do Inbox: em `components/common/inbox/issue-preview.tsx` (ou onde o
   `IssueDetailView` é montado no pane), o `DetailSidePanel` deve responder à largura do
   **container** (`@container` + `@5xl` como o issue-details fazia) e não ao viewport; manter
   o toggle. Teste renderizado.
4. Chips de filtro em views de **projeto** (`components/common/views/view-details.tsx`): converter
   `ViewFilter` de projeto (statusIds/priorityIds/health se existir) para chips somente leitura
   com colunas de projeto (crie `project-filter-columns` mínimo se não houver).
5. API devolve a entidade: `decideJoinRequest` (`lib/api/teams.ts` + rota) passa a devolver
   `{ requests: JoinRequestDto[], members: MemberDto[] }` e `team-members.tsx` usa
   `applyTeamMembers`; `postInitiativeUpdate` (`lib/api/initiative-detail.ts` + rota) devolve
   `{ update: InitiativeUpdateDto, initiative: InitiativeDto }` e `initiative-details.tsx`
   usa `applyInitiative` (só essa linha; o grupo 3 não toca esse arquivo, o grupo 2 toca
   OUTRAS partes dele — mantenha a mudança cirúrgica). Rotas continuam aceitando o mesmo
   input; clientes em `lib/client.ts` tipados. Testes PGlite.
6. `vitest.config.ts`: `maxWorkers`/`minWorkers` proporcionais à CPU (ex.: metade dos
   cores, mínimo 2) e `testTimeout: 60000`, com comentário do porquê (PGlite + Windows).
7. Guards: `test/option-controls-guard.test.ts` passa a cobrir `Button` com `size` dinâmico
   (qualquer `size={...}` que possa ser `icon` exige `aria-label` ou texto) e ganha um caso
   para `priority-selector`; novo `test/sidebar-motion.test.tsx` renderizado: o
   `CollapsibleContent` dos times recebe as classes/regra de animação (verificar `data-slot`
   e que `globals.css` contém os keyframes `collapsible-down/up` — leitura do arquivo).

## Grupo 2 — Datas reais em initiatives

- Schema: `initiative.start_date date` e `initiative.target_date date` (nullable). Manter
  `target` (varchar) como **rótulo humano** do período ("Q3 2026", "H2 2026", "2026",
  "Sep 2026", "2026-09-15").
- Backfill (migration custom): `target` que case `Q[1-4] YYYY` → último dia do trimestre;
  `H[12] YYYY` → 30/06 ou 31/12; `YYYY` → 31/12; `Mon YYYY`/`YYYY-MM` → último dia do mês;
  ISO `YYYY-MM-DD` → a própria data. O que não casar fica `target_date` nulo (rótulo segue).
- API (`lib/api/initiatives.ts`, rotas, `lib/client.ts`): inputs `startDate?`, `targetDate?`
  (ISO date ou null); DTO ganha `startDate`, `targetDate`. `target` continua aceito e, quando
  só ele vier, derivar `targetDate` pela mesma regra do backfill (função pura
  `targetDateFromLabel` em `lib/initiative-period.ts`, testada).
- UI: `initiative-target-picker.tsx` escreve `target` (rótulo) **e** `targetDate` (fim do
  período); ganha um modo "Start" para `startDate` (dia). Lista de initiatives ordena e
  filtra por `targetDate`; timeline de projetos da initiative usa `startDate`/`targetDate`
  quando existem. Detalhe (aside "Target") mostra o rótulo e, no tooltip, a data.
- Testes PGlite (create/update/backfill em `test/initiatives.test.ts`) e unitário do parser.

## Grupo 3 — Cycles: cool-down e snapshots (#24)

- Cool-down: `team.cycle_cooldown_days integer default 0`; Team settings → seção Cycles
  (input numérico 0–14). Rollover (`rolloverCyclesForTeam`) cria o próximo cycle começando em
  `fim do anterior + cooldown`; durante o cool-down nenhum cycle é `current` (Cycles mostra
  "Cool-down até <data>").
- Snapshots: tabela `cycle_snapshot(cycle_id, date, scope, started, completed)` com
  `UNIQUE(cycle_id, date)` (PK composta). **Sem job**: upsert idempotente do dia para cada
  cycle `current` (a) dentro do rollover (boot da página) e (b) no GET do detalhe do cycle.
  Buracos em dias sem acesso são interpolados no cliente.
- `scopeDelta` real = `(scope_hoje − scope_primeiro_snapshot) / scope_primeiro_snapshot`;
  `burnup` vem dos snapshots quando há ≥ 2 pontos (interpolando dias faltantes), senão
  mantém o sintético atual. `cycle-burnup-chart.tsx` sem mudança de contrato.
- Testes PGlite: rollover respeita cool-down; snapshot idempotente no mesmo dia; scopeDelta e
  burnup a partir de snapshots.

## Grupo 4 — Editor de blocos (#16)

- Biblioteca: **Tiptap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`,
  `@tiptap/extension-task-list` + `-task-item`, `@tiptap/extension-placeholder`,
  `@tiptap/core` no servidor para `generateText`). Versão compatível com React 19.
- Storage: `issue_content.description_doc jsonb` e `project_detail`/`project.description_doc
jsonb` (onde a descrição do projeto vive hoje) com o JSON do ProseMirror; `description`
  (texto) continua como **projeção em texto plano** (busca, API antiga, e-mails). PATCH
  aceita `descriptionDoc`; o servidor deriva `description` via `generateText`. Quando só
  `description` vier (cliente antigo), `description_doc` fica nulo e o editor converte
  `textToBlocks` → doc na abertura.
- UI: `components/common/editor/block-editor.tsx` (paragraph, H1–H3, listas, task list,
  code block, quote, divider, bold/italic/code/link, atalhos markdown do starter-kit, menu
  "/" mínimo com os blocos) substitui a área de descrição em `issue-details.tsx` e no overview
  de project; salva com debounce e só toasta erro; renderização somente leitura reaproveita o
  mesmo editor com `editable=false`. Cores/tipografia por token (prose do Linear: 15px/1.6).
- Testes: `test/block-editor.test.tsx` (renderiza doc, digita, chama onChange com JSON),
  serialização servidor (`descriptionDoc` → `description`), PGlite do PATCH.

## Grupo 5 — Projetos: DnD no board e reschedule na timeline (#19)

- Board (`projects-board.tsx`): colunas por **status** por padrão (grouping do display de
  projetos); `react-dnd` (já usado nas issues) para arrastar um card entre colunas → PATCH
  `statusId` (ou `teamId` quando agrupado por time) otimista + rollback via `applyProject`.
- Timeline (`projects-timeline.tsx`): arrastar a barra desloca `startDate` e `targetDate`
  juntos; arrastar a borda esquerda/direita muda só uma; snap por dia; PATCH ao soltar,
  otimista + rollback. Teclado: com a barra focada, ←/→ move 1 dia, Shift+←/→ 7 dias.
- Testes renderizados dos dois comportamentos (simular drop / keyboard) e PGlite do PATCH.

## Aceitação

Cada grupo: `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes; commits por entrega; sem dev
seam. Integração: merge dos cinco, consolidação das migrations em uma, suíte + build, smoke
no Chrome (cool-down, snapshot, editor, datas, DnD), PR para `develop`, release.
