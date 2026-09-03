# Débito técnico do front — itens 1 a 9

**Data:** 2026-09-02

**Status:** em execução (5 grupos em paralelo, integrados na branch `danilo/debt-front-1-9`)

Pedido: "resolva todos, não deixe débito, 1 ao 9". A lista veio da auditoria de
`2026-09-02-sidebar-e-estado-design.md`. O Linear é o benchmark de comportamento.

## Contratos compartilhados (valem para todos os grupos)

- **Chave de view** = `pathname` sem o prefixo do org: `/<org>/team/ENG/all` → `team/ENG/all`,
  `/<org>/my-issues` → `my-issues`, `/<org>/project/<id>/issues` → `project/<id>/issues`.
  Helper único: `lib/view-key.ts` → `export function viewKeyFromPathname(pathname: string): string`
  e hook `useViewKey()` (usa `useParams().orgId` + `usePathname`). **Grupo A cria; B usa.**
- **`store/detail-panel-store.ts`** (já existe nesta branch): `openByKind` para
  `initiative | project | issue`, `setOpen`, `toggle`, `hydratePanels`. Substitui
  `initiative-details-store` e o `'hidden'` do right-panel no project.
- **Sem toast de sucesso antes da API**; splice/rollback como no `issues-store`.
- **Migrações de localStorage**: `persist` com `version` + `migrate` (nunca quebrar o
  usuário que já tem a chave antiga).
- Código em inglês, comentários/commits em pt-BR, Conventional Commits, sem referência a IA.

## Grupos

### A — Display por view, layout no servidor, perf miúdos (itens 1, 4, 7)

1. `display-settings-store`: estado `byView: Record<viewKey, ViewDisplaySettings>`; hook
   `useDisplaySettings()` devolve o MESMO shape de hoje (`grouping`, `ordering`, …,
   setters) já ligado à view atual; consumidores (`grouped-issues-view`, `issue-grid`,
   `issue-line`, `display-options`) trocam para o hook. `view-store` (`viewType`
   list/board) idem: por view, mesma API `useViewStore()`. `resetDisplaySettings` limpa
   só a view atual. `version: 1` + `migrate` (estado flat antigo é descartado).
2. `lib/user-settings-sync.ts` + `lib/api/settings.ts` (`SettingsSchema.layout`,
   `.strict()`, `z.record`): sincronizar `displayByView`, `viewTypeByView`,
   `sidebarTeams.openById`, `sidebarPrefs` (badgeStyle/visibility/order),
   `detailPanels.openByKind`, `inboxListWidth`. Boot aplica do servidor (servidor vence),
   depois assina os stores (debounce 800 ms já existente). Teste PGlite do schema
   (aceita o blob, rejeita chave desconhecida) e teste do snapshot/apply.
3. `groupByKey` com `push` (sem spread O(n²)); `GroupedIssuesView` assina só as chaves que
   usa (selectors individuais); `ProjectsSection` (initiative-details) com `useMemo`;
   `isDefault` do Display considera `orderCompletedByRecency` e `displayProperties`.

### B — Painel lateral unificado e right-panel por rota (itens 2, 3)

2. `components/common/detail-side-panel.tsx`: `DetailSidePanel({ kind, title, children,
triggerLabel })` — desktop: `aside` 400 px, `hidden xl:flex`, `pl-1`, aberto conforme
   `useDetailPanelStore().openByKind[kind]`; mobile: um único `Sheet` (`w-[92vw]
sm:max-w-[400px] p-3 pt-12`) com o trigger no mesmo lugar (canto superior direito do
   cabeçalho do conteúdo, `xl:hidden`). Botão de toggle no header (28 × 28,
   `aria-label` "Open/Close <Kind> details", `aria-expanded`) para initiative, project E
   issue. Initiative e project passam a usar; issue (`components/common/inbox/
issue-preview.tsx` / detalhe de issue) também, trocando a container query por este
   painel. Remover o bloco "Properties" **inline** do overview de initiative e project
   (fica só no painel, como no Linear). Apagar `store/initiative-details-store.ts`
   (+ teste) e o uso de `'hidden'` no project header.
3. `right-panel-store`: `byRoute: Record<viewKey, RightPanelType | null>`; manter a API
   `useRightPanelStore(selector?)` devolvendo `{ openPanel, togglePanel, openPanelOfType,
closePanel }` já escopados à rota atual (hook interno com `useViewKey`). Sem
   persistência. Teste.

### C — Um motor de filtro para views (item 5)

5. `data/views.ts`: `viewFilterToFilters(filter: ViewFilter): FiltersState` e
   `filterIssuesForView` passa a delegar em `applyIssueFilters`. Manter o guard
   `test/view-filter-parity.test.ts` verde (servidor × cliente) e adicionar teste da
   conversão. Página de view (`components/common/views/view-details.tsx`) mostra a barra
   de filtro somente-leitura (chips) derivada do `ViewFilter` — sem editor novo.

### D — Splice por entidade em vez de re-hydrate (item 6)

6. `workspace-store`: `applyTeam(dto)`, `applyCycle(dto)`, `applyView(dto)`,
   `applyUser(dto)`, `removeTeamLocal/removeCycleLocal/removeViewLocal(id)`; catálogos
   (label/status) via `useCatalogStore` (`applyLabel/removeLabel/applyStatus/...`). Trocar
   os `hydrate()` pós-mutação onde a API já devolve o DTO: `team-settings`, `new-team-button`,
   `team-context-menu`, `add-team-member-button`, `team-members`, `role-control`,
   `cycle-actions`, `create-cycle-dialog`, `view-actions`, `create-view-dialog`,
   `issue-labels-settings`, `project-statuses-settings`, `project-context-menu`,
   `create-project-dialog`, `initiative-details` (ProjectsSection → `applyInitiative`),
   `profile`. Onde a API NÃO devolve o DTO, manter `hydrate()` e anotar. Testes dos
   splices (store) e `pnpm test` verde.

### E — Reviews: Guide com IA e profundidade sob demanda (itens 8, 9)

8. Guide: coluna `review.guide` (`jsonb`/`text`, nullable; migration aditiva) com
   `{ sections: GuideSection[], generatedAt, model }`. Rota `POST /api/v1/reviews/{id}/guide`
   gera via `lib/api/agent.ts` (Bedrock, mesmo client do agent) a partir do título, corpo e
   `patch` dos arquivos (cap de ~60 KB de patch; arquivo sem patch entra só como nome),
   persiste e devolve; `GET` do detalhe inclui `guide`. UI `review-guide.tsx`: renderiza as
   seções com `GuideSection` (já existe em `data/reviews.ts`) e o diff do `diffName` ao
   lado; botão "Generate guide" (e "Regenerate") com estado de loading; sem token/modelo →
   mensagem honesta. Teste do prompt/parsing com Bedrock mockado.
9. PRs antigos: `review.depth_synced_at` (timestamp nullable, migration aditiva). No `GET
/reviews/{id}`, se `files` e `commits` estão vazios, `depth_synced_at` é nulo e há
   `GITHUB_TOKEN`, buscar arquivos/commits/checks daquele PR uma vez (mesma `fetchPrDepth`),
   persistir e marcar. Nunca no listing. Teste PGlite.

## Aceitação (por grupo e no total)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes no worktree do grupo; commits
  Conventional por item; nada de dev seam commitado.
- Integração: eu mergeio os cinco branches em `danilo/debt-front-1-9`, rodo build + suíte
   - smoke no Chrome (display por view, painel unificado nas três páginas, view com chips,
     guide gerado, PR antigo abrindo diff) e abro o PR para `develop`.
