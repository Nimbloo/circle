# Plano — Produto: restos do editor, comentários de review, board por time, épico #25

**Spec:** `docs/superpowers/specs/2026-09-03-produto-restos-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch `danilo/produto-restos`
  (base `develop` = v0.26.0 + docs). Grupos 1–3 em worktrees isolados, mergeados aqui.
- **Feito:** spec e plano (Claude, 2026-09-03).
- **Última verificação:** —
- **Próximo passo:** grupos em execução; fatiamento do #25 em paralelo; depois integração,
  verificação, smoke, PR, release.
- **Bloqueios / decisões pendentes:** nenhum.

## Task 1 — Editor completo

- [ ] Imagens com upload (rota + S3), vídeo por URL, referência a issue com `#`, editor nos
      modais de criação com `descriptionDoc`.

## Task 2 — Comentários e veredito de review

- [ ] `review_comment` + API + realtime; thread no Overview; comentário por arquivo e por
      linha no Diff; Approve / Request changes.

## Task 3 — Board por time

- [ ] PATCH aceita `teamId`; grouping `status|team|none`; board por time com DnD.

## Task 4 — Épico #25 fatiado

- [ ] Issues por tema criadas e linkadas no épico.

## Task 5 — Integração e entrega

- [ ] Merge, migration consolidada, typecheck/lint/test/build, smoke no Chrome.
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release.
