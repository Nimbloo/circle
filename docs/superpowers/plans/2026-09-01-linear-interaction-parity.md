# Plano de implementação — paridade de interação com o Linear

> Execução obrigatória em RED → GREEN → REFACTOR para cada bug ou comportamento novo.

**Objetivo:** corrigir splitter da Inbox, estados da sidebar, navegação de filtros,
botões de opções e reproduzir criação/detalhe de initiatives do Linear.

**Arquitetura:** evoluir as primitives existentes de Radix/cmdk/resizable-panels,
preservar as camadas UI → client → route → service → db e adicionar somente o contrato
de initiatives aprovado na especificação.

**Spec:** `docs/superpowers/specs/2026-09-01-linear-interaction-parity-design.md`

## Estado (handoff entre agentes)

> Atualize este bloco ao fechar cada task e antes de pausar. Quem retoma (Codex ou
> Claude) lê daqui, não da memória de sessão.

- **Onde:** worktree `C:/Projetos/circle-functional-audit`, branch
  `danilo/linear-interaction-parity` (base `develop` @ `80bad79`, v0.21.0).
- **Feito:** Tasks 1–7 implementadas (Codex, 2026-09-01). Diff ainda **não commitado**.
- **Última verificação (2026-09-02, Claude):** `pnpm typecheck` ok · `pnpm lint` ok ·
  `pnpm test` 67 arquivos / 379 testes ok · `pnpm build` ok · `git diff --check` ok ·
  guard do dev seam ok (`git grep CIRCLE_DEV_AUTH_EMAIL HEAD -- lib/api/auth.ts middleware.ts` vazio).
- **Próximo passo:** Task 8 — smoke no Chrome (inbox splitter, filtros, new initiative,
  details toggle), atualizar `docs/PENDENCIAS.md`, commits Conventional, PR para
  `develop` referenciando o épico #25.
- **Bloqueios / decisões pendentes:** nenhum.

## Restrições globais

- Código em inglês; documentação, commits e PR em pt-BR.
- Cores por token; sem hexadecimal novo em componentes.
- Nenhum commit direto em `develop` ou `main`.
- Antes de todo commit: `git grep -n CIRCLE_DEV_AUTH_EMAIL HEAD -- lib/api/auth.ts middleware.ts`
  deve produzir saída vazia.
- Não editar migrations aplicadas; gerar uma migration nova pelo Drizzle.
- Nenhum toast de sucesso antes da confirmação da API.

## Task 1 — Infraestrutura de testes de interação

**Arquivos:** `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`,
`test/setup-dom.ts`, primeiro teste em `test/interaction-navigation.test.tsx`.

- [x] Adicionar Testing Library, user-event e jsdom nas versões compatíveis com React 19.
- [x] Expandir o include do Vitest para `.test.tsx` e isolar jsdom por arquivo.
- [x] Criar um teste RED mínimo que prova foco e teclado em um command menu.
- [x] Rodar somente o novo teste e confirmar falha pela ausência da primitive.

## Task 2 — Navegação hierárquica de filtros

**Arquivos:** criar `components/ui/use-command-pages.ts`; modificar
`components/data-table-filter/components/filter-selector.tsx` e
`components/common/initiatives/initiatives.tsx`; criar
`test/filter-keyboard-navigation.test.tsx`.

- [x] Escrever testes RED para ArrowRight/Enter, ArrowLeft, Escape em camadas e retorno
      de foco ao trigger.
- [x] Implementar a pilha mínima de páginas e integrar o filtro genérico.
- [x] Integrar o filtro de initiatives sem alterar seu estado URL-backed.
- [x] Confirmar seleção múltipla, busca, checked state e contadores.

## Task 3 — Sidebar e botões de opções

**Arquivos:** `app/globals.css`, `components/ui/sidebar.tsx`, headers e action menus
encontrados por `rg "MoreHorizontal|Ellipsis" components`;
`test/ui-option-controls.test.tsx`.

- [x] Escrever testes RED para tokens hover/selected distintos e nome acessível dos
      controles de opção.
- [x] Adicionar `--sidebar-hover` nos temas base e variantes e migrar apenas hover.
- [x] Padronizar action triggers para 28 × 28 px, ícone 16 px, `aria-label`, foco e estado
      aberto.
- [x] Remover glyphs decorativos que não tenham ação real; conectar aos menus existentes
      quando o domínio já possuir handlers.

## Task 4 — Splitter persistido da Inbox

**Arquivos:** `components/common/inbox/inbox.tsx`, `components/ui/resizable.tsx`, criar
`store/inbox-layout-store.ts` e `test/inbox-layout-store.test.ts`.

- [x] Escrever testes RED para default 300 px, clamp mínimo/máximo e persistência.
- [x] Implementar o store com valores normalizados e migração segura do storage.
- [x] Usar `ResizablePanelGroup` apenas no desktop e manter o fluxo mobile existente.
- [x] Ajustar handle para 1 px visual, 7 px de hit area, cursor e teclado.

## Task 5 — Contrato aditivo de initiatives

**Arquivos:** `db/schema.ts`, nova migration, `lib/api/initiatives.ts`, routes,
`data/initiatives.ts`, `lib/adapters-workspace.ts`, `lib/api/labels.ts`,
`test/initiatives.test.ts`, `test/labels.test.ts`.

- [x] Escrever testes RED para criar, listar, atualizar e excluir initiative com labels
      e iconColor; garantir limpeza da relation ao excluir label/initiative.
- [x] Adicionar `initiative_label`, ampliar `initiative.icon` e adicionar `icon_color`.
- [x] Gerar e revisar SQL aditivo, sem DROP de dados.
- [x] Carregar labels em lote no assemble e reconciliar relações transacionalmente.
- [x] Estender schemas Zod, DTOs, adapters e tipos com campos opcionais de entrada.

## Task 6 — New initiative com efeitos e controles do Linear

**Arquivos:** `components/common/initiatives/inline-new-initiative.tsx`,
`components/common/initiatives/initiatives.tsx`; criar primitives específicas em
`components/common/initiatives/`; testes de interação correspondentes.

- [x] Escrever testes RED para autofocus, ordem de Tab, Escape, Cancel, Create disabled,
      menu pesquisável e payload completo.
- [x] Implementar wrapper de motion com altura/opacidade, 200 ms e reduced motion.
- [x] Reproduzir card de 112 px e espaçamento medido, usando tokens.
- [x] Implementar picker de icon/emoji/cor, status, priority, owner, target period e labels.
- [x] Preservar mutation truthful, tratamento de erro e refresh do workspace.

## Task 7 — Open/Close Initiative details

**Arquivos:** criar `store/initiative-details-store.ts`; modificar
`components/layout/headers/initiative/header.tsx` e
`components/common/initiatives/initiative-details.tsx`; criar testes do store e UI.

- [x] Escrever testes RED para default aberto, toggle, persistência e labels acessíveis.
- [x] Implementar botão 28 × 28 px no extremo direito do header.
- [x] Renderizar/remover o aside desktop de 400 px sem coluna residual; preservar Sheet
      mobile e foco no trigger.
- [x] Alinhar Properties/Activity e permitir edição de labels e demais propriedades.

## Task 8 — Verificação integrada e continuidade

**Arquivos:** `docs/PENDENCIAS.md` e os testes/arquivos corrigidos por findings reais.

- [x] Rodar testes focados a cada task e a suíte completa ao final.
- [x] Rodar `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
      `git diff --check` e o guard do dev seam.
- [x] Validar manualmente no Chrome contra o Linear em dark/light e quatro viewports,
      incluindo mouse, teclado, resize, reload e reduced motion.
- [x] Auditar o diff completo por bugs e débitos; corrigir apenas findings reproduzíveis.
- [ ] Atualizar `docs/PENDENCIAS.md`, commitar em Conventional Commits e abrir PR para
      `develop` com a issue correspondente.
