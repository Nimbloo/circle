# Plano — Sidebar, filtros e estado do front (de-para Linear)

**Spec:** `docs/superpowers/specs/2026-09-02-sidebar-e-estado-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch
  `danilo/sidebar-linear-motion` (base `develop` = v0.23.0).
- **Feito:** Tasks 1–4 (Claude, 2026-09-02). Sidebar: collapse animado (altura + opacidade,
  200 ms, medido em headless: 162→0 px e 56→232 px) e estado por time persistido. Estado:
  `hydrate` coalescido (sem descartar chamada concorrente) e rollover só no boot. Filtros:
  "No project"/"No creator" explícitos, `is not` verdadeiro para valor ausente (option,
  multiOption, date), tabs Active/Backlog/All preservam `?filters=`, "Show sub-issues"
  removido (sem sub-issues no domínio).
- **Última verificação (2026-09-02, Claude):** `pnpm typecheck` ok · `pnpm lint` ok ·
  suíte completa e `pnpm build` (ver PR) · guard do dev seam vazio.
- **Próximo passo:** nenhum nesta fatia — mergeada em `develop` (#84) e em produção na
  v0.24.0 (#85). Fora da fatia (em PENDENCIAS): display settings por view, painel lateral
  unificado, right-panel por rota, de-para pixel do painel de initiatives.
- **Bloqueios / decisões pendentes:** de-para pixel do painel de initiatives exige liberar
  `linear.app` na extensão Claude-in-Chrome (navegação bloqueada nesta sessão).

## Task 1 — Sidebar: collapse animado e persistido por time

- [x] Keyframes `collapsible-down/up` (altura via `--radix-collapsible-content-height`,
      200 ms) no tema; `CollapsibleContent` com as utilities e `motion-reduce`.
- [x] `store/sidebar-teams-store.ts` persistido (`openById`), `key={item.id}`, Collapsible
      controlado; teste do store.
- [x] Smoke: altura amostrada em passos ao abrir/fechar; estado sobrevive ao reload.

## Task 2 — Estado: hydrate barato e sem race

- [x] `lib/client.ts`: rollover só quando `rollover === true`; `DataHydrator` passa `true`.
- [x] `workspace-store.hydrate`: coalescer chamadas concorrentes (promise em voo → repetir
      uma vez ao terminar) em vez de `return`. Teste.

## Task 3 — Filtros: valor ausente e persistência entre tabs

- [x] Opções "No project" / "No creator" / "No due date"; `is not` verdadeiro para ausente.
      Testes.
- [x] Tabs do header de issues propagam `?filters=`.
- [x] Remover "Show sub-issues" do Display (sem consumidor).

## Task 4 — Verificação e entrega

- [x] `pnpm typecheck`, `lint`, `test`, `build`, `git diff --check`, guard do dev seam.
- [x] Smoke no Chrome (sidebar, filtro `is not`, tabs).
- [x] `docs/PENDENCIAS.md` (itens fora da fatia), commits, PR para `develop`.
