# Reviews — arquivos, commits e checks reais

**Data:** 2026-09-02

**Status:** concluído (fatia 1; PR para `develop` em 2026-09-02)

## Objetivo

Hoje um review é só o metadado do PR: `checksPassed/checksTotal` fixos em 0 e as abas
Diff/Guide degradam para estado vazio porque o backend não modela arquivos nem commits.
Esta fatia traz para o Circle o que o GitHub já expõe por PR, sem inventar nada:

- **arquivos** (`GET /pulls/{n}/files`) com status, `+/-` e o `patch` unified;
- **commits** (`GET /pulls/{n}/commits`);
- **checks** (`GET /commits/{head.sha}/check-runs`) como `passed/total`.

Fora desta fatia: seções narradas do Guide (não há fonte de dados), notas de review e
comentários inline.

## Contrato (aditivo)

- Tabelas novas `review_file(review_id, path, status, additions, deletions, patch)` e
  `review_commit(review_id, sha, message, author, committed_at)`, PK composta, cascade no
  delete do review. Migration `0034`, sem DROP.
- `GET /api/v1/reviews/{id}` passa a devolver `files[]` e `commits[]` além do `ReviewDto`
  atual. A lista (`GET /api/v1/reviews`) não muda.
- `checksPassed/checksTotal` passam a ser preenchidos (colunas já existiam).

## Regras de ingestão

- Só PRs **abertos** recebem arquivos/commits/checks (mesmo cap de rate-limit do detalhe
  `additions/deletions`). PR fechado/mergeado mantém o que já tinha.
- Arquivos: até 3 páginas de 100 (PRs maiores ficam truncados no que a UI mostra; o
  contador `additions/deletions` do PR continua vindo do GET do PR). Commits: 1 página de 100. Tudo best-effort: falha em qualquer chamada não aborta o sync do PR.
- Substituição integral por PR (delete + insert na mesma transação).
- Checks: `passed` = check-runs com `conclusion` em `success|neutral|skipped`; `total` =
  `total_count`. Só grava quando a chamada respondeu.
- Webhook `pull_request`: depois do upsert, se houver `GITHUB_TOKEN` e o PR estiver aberto,
  busca o mesmo detalhe. Webhook `check_run`/`check_suite` (`completed`): recalcula os
  checks dos PRs listados em `pull_requests[]`.

## UI

- Aba **Diff** renderiza o `DiffView` existente com as linhas parseadas do `patch`
  (`lib/diff-patch.ts`: hunks → `context|add|del`, número da linha nova, `skip` entre
  hunks). Arquivo sem patch (binário/grande) mostra só o cabeçalho com `+/-`.
- Lista de arquivos e popover de commits passam a ter dado real; `category` é derivada do
  caminho (`test|tests|__tests__|spec|*.test.*|*.spec.*` → `tests`).
- Guide continua com o estado vazio honesto.

## Aceitação

- Testes PGlite: sync persiste arquivos/commits/checks para PR aberto, não toca PR
  mergeado, re-sync substitui arquivos, falha de `/files` não derruba o PR.
- Teste unitário do parser de patch (hunk simples, múltiplos hunks, sem newline no fim).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verdes; guard do dev seam vazio.
