# Plano — Reviews: arquivos, commits e checks reais (#22, fatia 1)

**Spec:** `docs/superpowers/specs/2026-09-02-reviews-depth-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch
  `danilo/22-reviews-files-commits-checks` (base `develop` = v0.22.1).
- **Feito:** Tasks 1–6 (Claude, 2026-09-02): schema + migration 0034, ingestão no sync e
  nos webhooks (`pull_request`, `check_run`/`check_suite`), DTO de detalhe, parser de
  patch, adapter, abas Overview/Guide/Diff no detalhe e correção do link da lista (id com
  `/` e `#` sem encode dava 404). Smoke real com `Nimbloo/nimbloo-hermes#27`: 1 arquivo com
  patch, 1 commit, checks 7/7, diff renderizado com 287 linhas puladas, +7/−1.
- **Última verificação (2026-09-02, Claude):** `pnpm typecheck` ok · `pnpm lint` ok ·
  `pnpm test` 70 arquivos / 391 testes ok · `pnpm build` ok · `git diff --check` ok ·
  guard do dev seam vazio.
- **Próximo passo:** nenhum — fatia 1 **concluída**: mergeada em `develop` (#81) e em
  produção na v0.23.0 (#82; migration 0034 aplicada, rollout Synced/Healthy). Fora desta
  fatia, ainda abertos na #22: Guide narrado (sem fonte de dados) e notas/comentários.
- **Bloqueios / decisões pendentes:** nenhum.

## Task 1 — Schema e migration

- [x] `review_file` e `review_commit` em `db/schema.ts`; `pnpm db:generate` → `0034`.
- [x] Revisar o SQL (aditivo, cascade no delete do review).

## Task 2 — Ingestão no sync e no webhook

- [x] Testes RED em `test/reviews.test.ts`: arquivos/commits/checks persistidos para PR
      aberto; PR mergeado intocado; re-sync substitui; falha de `/files` não aborta.
- [x] `fetchPrFiles`, `fetchPrCommits`, `fetchPrChecks` (best-effort) e persistência
      transacional em `lib/api/reviews.ts`; `head.sha` no tipo `GitHubPr`.
- [x] `handlePullRequestEvent` busca o detalhe quando há token; `handleCheckRunEvent`
      recalcula checks; rota do webhook aceita `check_run`/`check_suite`.

## Task 3 — DTO de detalhe e cliente

- [x] `getReview` devolve `files[]`/`commits[]` (`ReviewDetailDto`); rota `[id]` e
      `lib/client.ts` tipados.

## Task 4 — Parser de patch e adapter

- [x] Teste RED `test/diff-patch.test.ts`; `lib/diff-patch.ts` (`patchToLines`).
- [x] `adaptReview` mapeia arquivos (name/path/category), commits (sha curto, 1ª linha,
      timeAgo) e `diffs`.

## Task 5 — Aba Diff

- [x] `review-diff.tsx` renderiza `DiffView` por arquivo com patch; header só para os sem
      patch; contadores reais na barra.

## Task 6 — Verificação e entrega

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`, guard
      do dev seam.
- [x] Smoke no dev server com um repo real (`GITHUB_TOKEN` do `.env.local`, se houver).
- [x] Atualizar `docs/PENDENCIAS.md`, commits Conventional, PR para `develop` (Refs #22).
