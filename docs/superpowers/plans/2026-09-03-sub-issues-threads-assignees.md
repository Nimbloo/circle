# Plano — Sub-issues, checklists, threads + anexos, múltiplos responsáveis, edição inline

**Spec:** `docs/superpowers/specs/2026-09-03-sub-issues-threads-assignees-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch
  `danilo/sub-issues-threads-assignees` (base `develop` = v0.27.0 + docs). Grupos 1–4 em
  worktrees isolados, mergeados aqui.
- **Feito:** referência do Linear (docs/changelog), auditoria do código (estado de
  sub-issues/comentários/anexos/assignee/checklists; edição inline por superfície), spec e
  plano (Claude, 2026-09-03).
- **Última verificação:** —
- **Próximo passo:** grupos em execução; depois integração (migrations 0040–0042),
  verificação, smoke, PR (Closes #95 #98 #96), release MINOR.
- **Bloqueios / decisões pendentes:** nenhum.

## Task 1 — Sub-issues (#95)

- [ ] `issue.parent_id` + backfill de `issue_relation 'sub'`; create com `parentId` e herança;
      mover/remover pai; guarda de ciclo; rollup por `GROUP BY`; delete desvincula.
- [ ] Detalhe: sub-issues do servidor, criar inline (Enter, colar N linhas), Add existing,
      propriedade Parent, "Convert to sub-issue of…"; breadcrumb com pai.
- [ ] "Show sub-issues" no Display, chip do pai na linha, filtro Sub-issues, auto-close por time.

## Task 2 — Threads e anexos (#98)

- [ ] `comment.updated_at/resolved_at/resolved_by_id`; tabela `attachment`.
- [ ] Threads: colapso "N replies", reply no hover, Resolve/Reopen, "edited", Convert to
      sub-issue; notificação de participantes; e-mail com contexto.
- [ ] Anexos: `POST /api/v1/attachments` multipart 25 MB com allow-list; seção Attachments;
      anexos em comentário; composer com clipe/Ctrl+Shift+A/drag/paste.

## Task 3 — Múltiplos responsáveis (#96)

- [ ] `issue_assignee` + backfill; `assignees[]` no DTO; `assigneeIds` no update/create;
      filtros e `assigneeMe` pela junção; notificação e subscribe por assignee.
- [ ] Multi-select, pilha de avatares, My issues com colaboradores via servidor, CSV.

## Task 4 — Checklists no editor + edição inline nas listas

- [ ] Atalhos (Mod-Shift-7, Alt/Mod-Enter, Tab), paste de listas, converter item em sub-issue
      com `context` do editor.
- [ ] Edição inline: busca reconciliada com o store (A), sub-issues fora do `<Link>` (B), store
      com upsert para issue ausente (C), project/views com board + Display + side panel (D),
      seletores independentes das display properties (E), context menu com todos os projetos
      (F), seletores de label/project/estimate/cycle/due date na linha (G), reorder na lista (H),
      `project-badge` sem orgId fixo (I). Testes de linha e de busca.

## Task 5 — Integração e entrega

- [ ] Merge dos quatro, migrations consolidadas, `pnpm install`, typecheck/lint/test/build,
      smoke no Chrome (lista da spec).
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release, verificação em produção (migrations,
      health, anexo real).
