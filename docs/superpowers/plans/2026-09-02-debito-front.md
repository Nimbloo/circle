# Plano — Débito técnico do front, itens 1 a 9

**Spec:** `docs/superpowers/specs/2026-09-02-debito-front-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch `danilo/debt-front-1-9`
  (base `develop` = v0.24.0). Grupos A–E rodam em worktrees isolados (branches
  `debt/a-display`, `debt/b-panels`, `debt/c-view-filter`, `debt/d-splice`,
  `debt/e-reviews`) e são mergeados aqui.
- **Feito:** os cinco grupos entregaram e foram integrados em `danilo/debt-front-1-9`
  (Claude, 2026-09-02): A (display/layout por view + sync no servidor + perf), B (painel
  lateral unificado + right-panel por rota), C (motor único de filtro nas views + chips),
  D (splice por entidade em team/cycle/view/user/catálogos), E (Guide via Bedrock +
  profundidade sob demanda em PRs antigos). Dois conflitos de merge resolvidos
  (`lib/view-key.ts` add/add → versão de A; `ProjectsSection` → memo de A +
  `applyInitiative` de D).
- **Última verificação (2026-09-02, Claude):** cada grupo verde isolado (typecheck, lint,
  suíte); integrado A+B+C+E: 82 arquivos / 464 testes verdes; após D: typecheck ok, suíte +
  build finais em execução (ver PR).
- **Próximo passo:** nenhum — plano **concluído**: mergeado em `develop` (#87) e em
  produção na v0.25.0 (#88; migration 0035 aplicada, rollout Synced/Healthy).
- **Bloqueios / decisões pendentes:** nenhum.

## Task A — Display por view, layout no servidor, perf (itens 1, 4, 7)

- [x] `lib/view-key.ts`; `display-settings-store`/`view-store` por view com migração;
      consumidores no hook; testes.
- [x] `SettingsSchema.layout` + `user-settings-sync` (snapshot/apply/subscribe); testes.
- [x] `groupByKey` push; selectors do `GroupedIssuesView`; `ProjectsSection` memo;
      `isDefault` completo.

## Task B — Painel lateral unificado e right-panel por rota (itens 2, 3)

- [x] `DetailSidePanel` + toggle no header de initiative, project e issue; inline
      Properties removido; `initiative-details-store` apagado.
- [x] `right-panel-store` por rota com a mesma API; teste.

## Task C — Um motor de filtro para views (item 5)

- [x] `viewFilterToFilters` + `filterIssuesForView` via `applyIssueFilters`; chips na view;
      parity guard verde.

## Task D — Splice por entidade (item 6)

- [x] `applyTeam/applyCycle/applyView/applyUser` + catálogo; call sites migrados; testes.

## Task E — Reviews: Guide com IA e profundidade sob demanda (itens 8, 9)

- [x] Migration (guide, depth_synced_at); rota de guide com Bedrock; UI do Guide.
- [x] Profundidade sob demanda no GET do detalhe; teste PGlite.

## Task F — Integração e entrega

- [x] Merge dos cinco branches; typecheck/lint/test/build; smoke no Chrome.
- [x] `docs/PENDENCIAS.md`, PR para `develop`, release.
