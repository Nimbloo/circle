# Plano — Produto: restos do editor, comentários de review, board por time, épico #25

**Spec:** `docs/superpowers/specs/2026-09-03-produto-restos-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch `danilo/produto-restos`
  (base `develop` = v0.26.0 + docs). Grupos 1–3 em worktrees isolados, mergeados aqui.
- **Feito:** Tasks 1–4 (grupos mergeados em `danilo/produto-restos`; épico #25 fatiado em
  #94–#102). Extras da integração: grouping padrão `status` na lista/board e popover de
  Display sem sobreposição do Reset. Migration única nova: `0039_review_comment`.
- **Última verificação:** typecheck, lint, 99 arquivos / 612 testes, build; smoke no dev
  server: comentário na thread, comentário ancorado em `pom.xml:299`, Approve com badge,
  board por time com DnD (PATCH `teamId` 200 / 400 inválido), chip `#ENG-2` persistido no
  doc, issue criada pelo modal com heading/negrito/referência. Upload de imagem local
  responde 503 (sem bucket em dev; em prd usa o mesmo S3 dos avatares).
- **Próximo passo:** Task 5 — PR para `develop`, CI, merge, `chore: release v0.27.0`, PR
  para `main`, verificar rollout/migration 0039/health, sincronizar `develop`, docs.
- **Bloqueios / decisões pendentes:** nenhum.

## Task 1 — Editor completo

- [x] Imagens com upload (rota + S3), vídeo por URL, referência a issue com `#`, editor nos
      modais de criação com `descriptionDoc`.

## Task 2 — Comentários e veredito de review

- [x] `review_comment` + API + realtime; thread no Overview; comentário por arquivo e por
      linha no Diff; Approve / Request changes.

## Task 3 — Board por time

- [x] PATCH aceita `teamId`; grouping `status|team|none`; board por time com DnD.

## Task 4 — Épico #25 fatiado

- [x] Issues por tema criadas e linkadas no épico.

## Task 5 — Integração e entrega

- [x] Merge, migration consolidada, typecheck/lint/test/build, smoke no Chrome.
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release.
