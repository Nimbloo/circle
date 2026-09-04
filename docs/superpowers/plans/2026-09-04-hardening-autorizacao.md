# Plano — Hardening de autorização, identidade e bugs da auditoria da v0.29.0

**Spec:** `docs/superpowers/specs/2026-09-04-hardening-autorizacao-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch
  `danilo/hardening-autorizacao` (base `develop` = v0.29.0). Grupos 1–3 em worktrees isolados.
- **Feito:** Tasks 1–3 (três grupos mergeados em `danilo/hardening-autorizacao`), mais as
  três pontas entre eles fechadas na integração: tolerância obsoleta do guarda de auth
  removida, `slaDueAt` no contrato de issue (o indicador passou a usar a hora) e agregações
  recortando pelos times visíveis em vez de exigir `?team=`.
- **Última verificação:** typecheck, lint, 155 arquivos / 989 testes e build (Claude,
  2026-09-04). Smoke no dev server: uso normal de admin intacto (criar, editar, comentar,
  activity); SLA de 4 h gravando vencimento com hora; busca casando "referencia" e
  "referência" pelo índice; webhook para 169.254.169.254 recusado com 400; desativar some da
  lista padrão, aparece com `includeDeactivated=true` e vira `Guest`; apagar issue e apagar
  time com automação (os dois 23503 da auditoria) agora 200.
- **Próximo passo:** Task 4 — PR para `develop`, CI, merge, release, verificação em produção.
- **Bloqueios / decisões pendentes:** conferir no chart `nimbloo-k8s/circle-prd` o valor de
  `CIRCLE_KEYCLOAK_ALLOWED_CLIENTS` (default do repo é seguro; o risco é o valor deployado) —
  ação de infraestrutura, fora deste repo.

## Task 1 — Escopo de verdade (Grupo 1)

- [x] `assertCanWrite*` em `lib/api/scope.ts` e chamada **dentro dos serviços**.
- [x] Fechar os cenários provados: criar/editar/apagar issue e projeto fora do escopo, mover
      para o próprio time, comentar e ler activity alheia, 11 sub-rotas de issue, relations,
      subscription, rank, labels, milestones/resources/updates, dependencies, import, views.
- [x] `deleteIssue` limpa `issue_import`.
- [x] `test/route-scope-guard.test.ts` + correção dos pontos cegos do guarda de auth.

## Task 2 — Identidade, credenciais e integrações (Grupo 2)

- [x] 403 para desativado na resolução do ator; papel rebaixado na desativação.
- [x] `listMembers` com `includeDeactivated`; desativado recusado como assignee/lead.
- [x] `isAdmin` em webhooks (6) e tokens (3); anti-SSRF + `redirect: 'manual'`.
- [x] `requireEmail` nas duas rotas de time com fail-open.
- [x] `deleteTeam` limpa SLA e automações; anexo checa `Content-Length` antes do corpo.

## Task 3 — Comportamento, dados e observabilidade (Grupo 3)

- [x] `sla_due_at` com hora real; "at risk" sobre a janela contratada.
- [x] Busca com acento (índice, consulta e fallback).
- [x] Automações: `try/catch` no motor, regra padrão não ressuscita, `set_priority` recalcula SLA.
- [x] Sweep de webhook ignora desabilitado e sai do caminho de todo publish.
- [x] Triagem: dedupe em voo, não ressuscita card descartado, debounce da fila.
- [x] Burn-up sem interpolação inventada; gráfico de projeto por data.
- [x] Sentry recebendo os 5xx; `migrate()` pela conexão dedicada.

## Task 4 — Integração e entrega

- [x] Merge dos três, migrations consolidadas, typecheck/lint/test/build.
- [x] Smoke de regressão (convidado, desativado, admin em token/webhook, SLA, acento).
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release, verificação em produção.
