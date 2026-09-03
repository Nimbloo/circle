# Plano — Débito técnico do front, itens 1 a 9

**Spec:** `docs/superpowers/specs/2026-09-02-debito-front-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch `danilo/debt-front-1-9`
  (base `develop` = v0.24.0). Grupos A–E rodam em worktrees isolados (branches
  `debt/a-display`, `debt/b-panels`, `debt/c-view-filter`, `debt/d-splice`,
  `debt/e-reviews`) e são mergeados aqui.
- **Feito:** spec, `store/detail-panel-store.ts` (+ teste) e este plano (Claude, 2026-09-02).
- **Última verificação:** —
- **Próximo passo:** grupos em execução; depois integração, verificação, PR, release.
- **Bloqueios / decisões pendentes:** nenhum.

## Task A — Display por view, layout no servidor, perf (itens 1, 4, 7)

- [ ] `lib/view-key.ts`; `display-settings-store`/`view-store` por view com migração;
      consumidores no hook; testes.
- [ ] `SettingsSchema.layout` + `user-settings-sync` (snapshot/apply/subscribe); testes.
- [ ] `groupByKey` push; selectors do `GroupedIssuesView`; `ProjectsSection` memo;
      `isDefault` completo.

## Task B — Painel lateral unificado e right-panel por rota (itens 2, 3)

- [x] `DetailSidePanel` + toggle no header de initiative, project e issue; inline
      Properties removido; `initiative-details-store` apagado.
- [x] `right-panel-store` por rota com a mesma API; teste.

## Task C — Um motor de filtro para views (item 5)

- [ ] `viewFilterToFilters` + `filterIssuesForView` via `applyIssueFilters`; chips na view;
      parity guard verde.

## Task D — Splice por entidade (item 6)

- [ ] `applyTeam/applyCycle/applyView/applyUser` + catálogo; call sites migrados; testes.

## Task E — Reviews: Guide com IA e profundidade sob demanda (itens 8, 9)

- [ ] Migration (guide, depth_synced_at); rota de guide com Bedrock; UI do Guide.
- [ ] Profundidade sob demanda no GET do detalhe; teste PGlite.

## Task F — Integração e entrega

- [ ] Merge dos cinco branches; typecheck/lint/test/build; smoke no Chrome.
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release.
