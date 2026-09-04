# Plano — Hardening de autorização, identidade e bugs da auditoria da v0.29.0

**Spec:** `docs/superpowers/specs/2026-09-04-hardening-autorizacao-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch
  `danilo/hardening-autorizacao` (base `develop` = v0.29.0). Grupos 1–3 em worktrees isolados.
- **Feito:** auditoria completa (3 frentes, 16 cenários provados), spec e plano
  (Claude, 2026-09-04).
- **Última verificação:** —
- **Próximo passo:** grupos em execução; depois integração, verificação, smoke de regressão,
  PR para `develop`, release.
- **Bloqueios / decisões pendentes:** conferir no chart `nimbloo-k8s/circle-prd` o valor de
  `CIRCLE_KEYCLOAK_ALLOWED_CLIENTS` (o default do repo é seguro; o risco é o valor deployado) —
  ação de infraestrutura, fora deste repo.

## Task 1 — Escopo de verdade (Grupo 1)

- [ ] `assertCanWrite*` em `lib/api/scope.ts` e chamada **dentro dos serviços**.
- [ ] Fechar os cenários provados: criar/editar/apagar issue e projeto fora do escopo, mover
      para o próprio time, comentar e ler activity alheia, 11 sub-rotas de issue, relations,
      subscription, rank, labels, milestones/resources/updates, dependencies, import, views.
- [ ] `deleteIssue` limpa `issue_import`.
- [ ] `test/route-scope-guard.test.ts` + correção dos pontos cegos do guarda de auth.

## Task 2 — Identidade, credenciais e integrações (Grupo 2)

- [ ] 403 para desativado na resolução do ator; papel rebaixado na desativação.
- [ ] `listMembers` com `includeDeactivated`; desativado recusado como assignee/lead.
- [ ] `isAdmin` em webhooks (6) e tokens (3); anti-SSRF + `redirect: 'manual'`.
- [ ] `requireEmail` nas duas rotas de time com fail-open.
- [ ] `deleteTeam` limpa SLA e automações; anexo checa `Content-Length` antes do corpo.

## Task 3 — Comportamento, dados e observabilidade (Grupo 3)

- [ ] `sla_due_at` com hora real; "at risk" sobre a janela contratada.
- [ ] Busca com acento (índice, consulta e fallback).
- [ ] Automações: `try/catch` no motor, regra padrão não ressuscita, `set_priority` recalcula SLA.
- [ ] Sweep de webhook ignora desabilitado e sai do caminho de todo publish.
- [ ] Triagem: dedupe em voo, não ressuscita card descartado, debounce da fila.
- [ ] Burn-up sem interpolação inventada; gráfico de projeto por data.
- [ ] Sentry recebendo os 5xx; `migrate()` pela conexão dedicada.

## Task 4 — Integração e entrega

- [ ] Merge dos três, migrations consolidadas, typecheck/lint/test/build.
- [ ] Smoke de regressão (convidado, desativado, admin em token/webhook, SLA, acento).
- [ ] `docs/PENDENCIAS.md`, PR para `develop`, release, verificação em produção.
