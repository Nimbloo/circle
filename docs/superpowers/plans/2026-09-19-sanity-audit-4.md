# Sanidade 4 — E2E de todas as features, curadoria visual e transições — Plano

## Estado (handoff entre agentes)

- **Onde:** branch `danilo/sanity-audit-4`, empilhada sobre `danilo/circle-loading` (loading padrão com o Circle girando), que está sobre `danilo/sanity-audit-3` (PR #171), que está sobre o #170.
- **Ambiente de E2E:**
   - Worktree `.claude/worktrees/s4-e2e`, no HEAD da branch, com o bypass de login aplicado **só lá, nunca commitado** e build de produção.
   - 5 servidores `next start` nas portas 3101–3105, cada um com um banco clonado do `circle_perf` (`circle_e2e_1..5`).
   - Material em `%TEMP%/claude/C--Projetos-circle/9db28257-7287-4294-9200-7e3025940364/scratchpad/audit4/`: `common.md`, provocações do Codex, pastas `is/pl/co/ad/vi`.
- **Feito:**
   - Loading padrão e fade de conteúdo (branch `danilo/circle-loading`).
   - Exclusão de time explica a recusa (`50f57a8`).
   - Provocações do Codex geradas (`codex-provocations.md`).
- **Em andamento:**
   - 4 agentes de E2E: issues (3101), planejamento (3102), comunicação (3103), administração (3104).
   - Curadoria visual (3105).
   - Exclusão de time em cascata, no worktree `.claude/worktrees/s4-team-delete`.
- **Próximo passo:** consolidar os achados em `docs/superpowers/specs/2026-09-19-sanity-audit-4-findings.md` → decisões → frentes de correção → integração → remedição → PR.
- **Bloqueios:** a extensão do Claude no Chrome não está conectada, então não dá para ver o projeto "Módulo Vistoria" em produção nem usar o Linear real como referência. O painel lateral do projeto está sendo investigado localmente pelo agente de planejamento.

## Decisões do usuário (2026-09-19)

- **Loading:** o Circle girando substitui todos os skeletons e spinners.
- **Excluir time:** apaga tudo junto (issues, projetos, ciclos, views, documentos) numa transação. O diálogo mostra o impacto e exige digitar o nome do time.
- **Escopo da rodada 4:** E2E de todas as features (adicionar, remover, editar, ajustar, aumentar, diminuir), curadoria visual com foco em aparecer/desaparecer e consistência de layout, Codex provocando cenários, benchmark linear.app.
