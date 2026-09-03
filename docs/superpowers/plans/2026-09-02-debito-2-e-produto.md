# Plano — Débito restante (1–7) e produto (cycles, editor, datas, DnD)

**Spec:** `docs/superpowers/specs/2026-09-02-debito-2-e-produto-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch `danilo/debt-2-e-produto`
  (base `develop` = v0.25.0 + docs). Grupos 1–5 em worktrees isolados, mergeados aqui.
- **Feito:** spec e plano (Claude, 2026-09-02).
- **Última verificação:** —
- **Próximo passo:** grupos em execução; depois integração (migrations consolidadas),
  verificação, smoke, PR, release.
- **Bloqueios / decisões pendentes:** nenhum.

## Task 1 — Débito 1–7 + contrato do item 5

- [ ] Código morto de reviews; perfil de membro no `DetailSidePanel`; issue no Inbox por
      container; chips em views de projeto; API devolve entidade (join-request, health
      update); vitest config; guards (size dinâmico, motion da sidebar).

## Task 2 — Datas reais em initiatives

- [ ] `start_date`/`target_date` + backfill; parser de rótulo; picker; lista/timeline/detalhe.

## Task 3 — Cycles: cool-down e snapshots

- [ ] `cycle_cooldown_days`; `cycle_snapshot` com upsert lazy; `scopeDelta`/`burnup` reais.

## Task 4 — Editor de blocos

- [ ] Tiptap; `description_doc` em issue e project; PATCH com projeção texto; editor na UI.

## Task 5 — Projetos: DnD e reschedule

- [ ] Board por status com DnD; timeline com arraste/teclado; PATCH otimista.

## Task 6 — Integração e entrega

- [ ] Merge dos cinco; migrations consolidadas; typecheck/lint/test/build; smoke no Chrome.
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release.
