# Plano — Débito restante (1–7) e produto (cycles, editor, datas, DnD)

**Spec:** `docs/superpowers/specs/2026-09-02-debito-2-e-produto-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch `danilo/debt-2-e-produto`
  (base `develop` = v0.25.0 + docs). Grupos 1–5 em worktrees isolados, mergeados aqui.
- **Feito:** cinco grupos entregues e integrados em `danilo/debt-2-e-produto` (Claude,
  2026-09-02): 1 (débito miúdo + contrato aditivo), 2 (datas reais em initiatives com
  backfill), 3 (cool-down e snapshots de cycles), 4 (editor Tiptap com `description_doc`),
  5 (DnD do board e reschedule da timeline). Migrations consolidadas: `0036` (schema de
  initiatives/cycles), `0037` (backfill custom), `0038` (`description_doc`).
- **Última verificação (2026-09-02, Claude):** parcial (1,2,3,5): typecheck/lint ok, 91
  arquivos / 553 testes; final com o grupo 4: typecheck ok, lint + suíte + build em execução
  (ver PR).
- **Próximo passo:** nenhum — plano **concluído**: mergeado em `develop` (#91) e em
  produção na v0.26.0 (#92; migrations 0036–0038 aplicadas, rollout Synced/Healthy).
- **Bloqueios / decisões pendentes:** nenhum.

## Task 1 — Débito 1–7 + contrato do item 5

- [x] Código morto de reviews; perfil de membro no `DetailSidePanel`; issue no Inbox por
      container; chips em views de projeto; API devolve entidade (join-request, health
      update); vitest config; guards (size dinâmico, motion da sidebar).

## Task 2 — Datas reais em initiatives

- [x] `start_date`/`target_date` + backfill; parser de rótulo; picker; lista/timeline/detalhe.

## Task 3 — Cycles: cool-down e snapshots

- [x] `cycle_cooldown_days`; `cycle_snapshot` com upsert lazy; `scopeDelta`/`burnup` reais.

## Task 4 — Editor de blocos

- [x] Tiptap; `description_doc` em issue e project; PATCH com projeção texto; editor na UI.

## Task 5 — Projetos: DnD e reschedule

- [x] Board por status com DnD; timeline com arraste/teclado; PATCH otimista.

## Task 6 — Integração e entrega

- [x] Merge dos cinco; migrations consolidadas; typecheck/lint/test/build; smoke no Chrome.
- [x] `docs/PENDENCIAS.md`, PR para `develop`, release.
