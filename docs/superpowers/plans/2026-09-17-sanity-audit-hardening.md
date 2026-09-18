# Sanity Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os riscos de integridade, escalabilidade, robustez e UX/UI encontrados na auditoria do Circle.

**Architecture:** Manter as camadas existentes e adicionar validações nas funções de domínio, limites nas rotas e paginação retrocompatível. A relação iniciativa–projeto é intencionalmente muitos-para-muitos para suportar rollups mãe/filha; não será criada uma restrição única. A UI consumirá os mesmos endpoints com parâmetros opcionais.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, PostgreSQL/PGlite, Vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-09-17-sanity-audit-hardening-design.md`

## Estado (handoff entre agentes)

- Branch: `danilo/sanity-audit-hardening`, worktree principal `C:/Projetos/circle`.
- Implementado: invariantes cross-team, escopo de parent initiative, limites/idempotência de import, compressão negociada, feeds limitados, filtros SQL de projetos, escopo de workspace, busca de iniciativas ancestrais, locale pt-BR, textos críticos de UI e build no CI.
- Última verificação: 2026-09-17; suíte completa 170 arquivos/1.074 testes passou, typecheck/lint/build passaram.
- Próximo passo: atualizar `HANDOFF.md`, revisar diff e confirmar que o seam local não entrou no histórico.
- Bloqueios externos: Bedrock depende do formulário de use case da AWS; CSP nonce e medição de bundle devem ser tratados em mudança dedicada se houver ganho medido.

## Global Constraints

- Contexto em pt-BR; identificadores e código em inglês.
- Não commitar o seam `CIRCLE_DEV_AUTH_EMAIL`.
- Não alterar contratos de API estabilizados sem compatibilidade retroativa.
- Toda correção de comportamento deve começar com teste falhando.
- Não adicionar dependência de i18n pesada sem necessidade.
- Não incluir mudanças em repositórios de infraestrutura neste plano.

---

## Task 1: Invariantes de issues e iniciativas

**Files:**

- Modify: `lib/api/issues.ts`
- Modify: `lib/api/initiatives.ts`
- Modify: `app/api/v1/initiatives/route.ts`
- Modify: `app/api/v1/initiatives/[id]/route.ts`
- Test: `test/issue-cross-team.test.ts`
- Test: `test/guest-scope.test.ts`

- [x] Escrever testes que criam dois times visíveis para o mesmo ator e tentam criar/alterar issue com pai ou projeto do time errado.
- [x] Executar os testes específicos e confirmar que falham porque a relação cruzada atualmente é aceita.
- [x] Extrair validação de relações no domínio e exigir o mesmo `teamId` para pai, projeto, ciclo e milestone.
- [x] Validar `parentId` da iniciativa contra `assertInitiativeInScope` antes de criar ou alterar.
- [x] Executar os testes específicos e a suíte de escopo.

## Task 2: Reconciliação iniciativa–projeto

**Files:**

- Modify: `db/schema.ts`
- Modify: `lib/api/initiatives.ts`
- Modify: `lib/api/projects.ts`
- Test: `test/initiatives-routes.test.ts`
- Test: `test/projects-routes.test.ts`

- [x] Confirmar na suíte existente que o vínculo mãe+filha e o rollup podem coexistir sem duplicidade.
- [x] Preservar explicitamente o contrato de produto: associação principal em `project.initiativeId` e links em `initiative_project` para rollup.
- [x] Revisar create/update/delete de projetos e iniciativas; nenhum ajuste de schema é necessário.
- [x] Executar testes de create/update/delete de projetos e iniciativas.

## Task 3: Limites e idempotência da importação

**Files:**

- Modify: `app/api/v1/import/preview/route.ts`
- Modify: `app/api/v1/import/commit/route.ts`
- Modify: `lib/api/import.ts`
- Test: `test/import.test.ts`

- [x] Escrever testes para CSV acima do limite, excesso de linhas/colunas/células e `externalId` duplicado.
- [x] Executar os testes específicos e confirmar falhas.
- [x] Adicionar limites compartilhados antes de `file.text()`/parse completo quando houver `Content-Length`; validar novamente o texto recebido.
- [x] Rejeitar duplicidades antes do loop de writes.
- [x] Executar testes de importação e de upload para garantir que os limites existentes permanecem.

## Task 4: Compressão e feeds paginados

**Files:**

- Modify: `lib/api/http.ts`
- Modify: `lib/api/issue-detail.ts`
- Modify: `lib/api/project-detail.ts`
- Modify: rotas de activity/comments/updates correspondentes
- Modify: `lib/client.ts`
- Test: `test/api-compression.test.ts`
- Test: `test/issue-detail.test.ts`
- Test: `test/project-detail.test.ts`

- [x] Escrever teste para `gzip;q=0` e preservar o corpo em falha de compressão.
- [x] Implementar parser mínimo de negociação e clonar/armazenar o body antes da operação assíncrona.
- [x] Implementar limite padrão e parâmetro opcional retrocompatível nos feeds.
- [x] Atualizar cliente e rotas para aceitar `limit` sem alterar chamadas existentes.

## Task 5: Workspace, listagens e busca

**Files:**

- Modify: `lib/api/projects.ts`
- Modify: `lib/api/workspace.ts`
- Modify: `lib/api/search.ts`
- Test: `test/workspace.test.ts`
- Test: `test/search-perf.test.ts`

- [x] Adicionar teste que comprova que projetos fora do escopo não são montados antes do filtro.
- [x] Mover filtros de time/initiative/status para a consulta e manter filtro final defensivo.
- [x] Reduzir consultas/payloads de escopo sem quebrar consumidores atuais.
- [x] Paralelizar grupos independentes da busca e preservar fallback sinalizado.
- [x] Confirmar que rollover/snapshot já usam lock/upsert idempotente e não exigir mudança especulativa.
- [x] Medir busca: 2000 issues em ~5,7 ms (termo raro) e ~10,2 ms (termo comum) no teste de performance.

## Task 6: Locale, acessibilidade e consistência visual

**Files:**

- Modify: `app/layout.tsx`
- Modify: `components/data-table-filter/**`
- Modify: componentes com textos de interface identificados na auditoria
- Create: `lib/i18n/pt-BR.ts`
- Test: testes de componentes afetados

- [x] Escrever teste para o locale padrão dos filtros e corrigir `lang`/viewport.
- [x] Corrigir `lang="pt-BR"` e remover `maximum-scale=1`.
- [x] Traduzir placeholders, aria-labels e estados vazios críticos sem adicionar dependência pesada.
- [x] Corrigir usos explícitos de `en-US` e manter tokens/ícones existentes.
- [x] Revisar tokens, raios, ícones e estados vazios sem substituir cores semânticas legítimas.

## Task 7: CI, bundle e CSP

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: rotas/componentes responsáveis pelos maiores bundles
- Modify: `lib/security/content-security-policy.ts`
- Test: smoke/build checks

- [x] Adicionar `pnpm build` à validação de CI.
- [x] Revisar bundles e manter imports dinâmicos existentes; não aplicar split especulativo sem ganho medido.
- [x] Revisar autenticação middleware/Edge no build e manter o seam somente local.
- [x] Avaliar nonce/hash; manter o bootstrap atual por exigir coordenação request-level com headers CSP.

## Task 8: Verificação final e handoff

**Files:**

- Modify: `docs/PENDENCIAS.md` somente para atualizar fatos comprovados
- Modify: `HANDOFF.md`

- [x] Executar testes específicos de cada task.
- [x] Executar testes, typecheck, lint, build e `git diff --check`.
- [x] Confirmar que o seam não aparece no histórico versionado.
- [x] Revisar diff por arquivos não relacionados.
- [x] Atualizar handoff com branch, estado, verificações e pendências externas.
