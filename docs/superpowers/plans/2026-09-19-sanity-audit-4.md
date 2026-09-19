# Sanidade 4 — E2E de todas as features, curadoria visual e transições — Plano

> **Para agentes:** execute a SUA frente, task a task, no worktree indicado. Achados detalhados em `docs/superpowers/specs/2026-09-19-sanity-audit-4-findings.md` (IDs `vi#`, `is#`, `pl#`, `co#`, `ad#`).

## Estado (handoff entre agentes)

- **Onde:** branch `danilo/sanity-audit-4`, empilhada sobre `danilo/circle-loading`, que está sobre `danilo/sanity-audit-3` (PR #171), que está sobre o #170. As frentes ficam em `.claude/worktrees/s4-*` (Claude) e em `C:/Projetos/.codex-worktrees/circle-s4-s` (Codex), todas a partir do HEAD do commit deste plano.
- **Feito:**
   - Loading padrão e fade de conteúdo.
   - A exclusão de time explica a recusa.
   - Exclusão de time em cascata (`04f5a08`).
   - Levantamento E2E completo (5 relatórios + Codex), consolidado no spec.
   - Frente I (Issues) completa: is#1–25 exceto is#20 (idioma, fora de escopo) e a
     parte de barra de lote do is#21 (fica com a M). 21 commits em `danilo/s4-i`
     (`39242b5`..`69276f8`); typecheck e lint (`pnpm lint`/`pnpm typecheck`) limpos.
- **Ambiente de E2E:** worktree `.claude/worktrees/s4-e2e` com o bypass de login aplicado **só nele** e servidores nas portas 3101–3105 (bancos `circle_e2e_1..5`). Serve para a remedição, depois de refazer o build com o código integrado.
- **Próximo passo:** frentes S (Codex), M, I, P, C e A em paralelo → integração S → M → I → P → C → A → suíte, typecheck, lint e build → remedição E2E dos achados → PR.
- **Bloqueios:** nenhum. A extensão do Chrome não está conectada, então não houve comparação lado a lado com o Linear real.

## Decisões do usuário (2026-09-19)

- **Loading:** o Circle girando substitui todos os skeletons e spinners.
- **Excluir time:** apaga tudo junto numa transação, com diálogo de impacto e confirmação pelo nome do time. Já está feito.
- **Escopo:** corrigir todos os bugs e ajustes visuais, e também as lacunas de paridade com o Linear:
   - sidecar e detalhe editáveis;
   - editar e excluir updates;
   - inbox com paginação e exclusão;
   - atalhos reais da issue + painel `?` + tabela única de atalhos;
   - reordenar favoritos;
   - renomear e excluir pastas;
   - Undo ao excluir issue;
   - **corpo de documento** com o editor de blocos;
   - **grupos de label**;
   - **hierarquia de times** na sidebar e em /teams.
- **Idioma pt/en:** fica como está (decisão anterior). Não é reportado nem alterado.

## Global Constraints

- Contexto em pt-BR e código em inglês. Conventional Commits em pt-BR, sem emoji, **sem mencionar IA/assistente**, sem `Co-Authored-By`. Nunca `CIRCLE_DEV_AUTH_EMAIL`.
- Correção de comportamento começa com **teste que falha** (Vitest + PGlite; UI com jsdom + Testing Library + `// @vitest-environment jsdom` + `import './setup-dom'`, e `seedCatalog()` de `test/helpers/catalog-fixture.ts`).
- Camadas: UI → `lib/client.ts` → `app/api/v1` → `lib/api` → `db`. Cores só por token. Loading sempre `CircleLoading`/`LoadingArea` (há uma guarda estática).
- **Migrations: só a frente A gera.**
- Contratos de API: só aditivos.
- Não rodar `pnpm build`, `pnpm dev` nem a suíte inteira. Rodar testes específicos + `pnpm typecheck` + `pnpm lint` ao fim.
- Evento SSE publicado depois do commit, com `teamId`.

## Sistema de motion e layout (vale para todas as frentes; M implementa os tokens e primitivos)

Tokens em `:root` (`app/globals.css`), expostos no `@theme`:

- Curvas:
   - `--ease-out: cubic-bezier(0.16,1,0.3,1)` (entradas)
   - `--ease-in: cubic-bezier(0.4,0,1,1)` (saídas)
   - `--ease-std: cubic-bezier(0.2,0,0,1)` (mudanças de layout)
- Durações:
   - `--dur-instant: 80ms` (hover, cor, foco)
   - `--dur-fast: 120ms` (saídas de popover, menu e tooltip)
   - `--dur-base: 160ms` (entradas de popover, menu, select e tooltip)
   - `--dur-modal: 200ms` (entrada de dialog e palette; layout de painel, sidebar e collapsible)
   - `--dur-sheet: 240ms` (sheet, com saída em 180 ms)
   - `--dur-content: 150ms` (conteúdo)

Regras por superfície:

- **Menus, popovers, select e tooltip.** Entrada de 160 ms `ease-out`: opacity + scale de .97 + 4 px vindos do lado do trigger. Saída de 120 ms `ease-in`. Origem do transform em `--radix-*-content-transform-origin`.
- **Dialog e palette.** Entrada de 200 ms e saída de 120 ms, scale de .98. Um único overlay `rgb(0 0 0/.4)`. A palette fica montada.
- **Sheet.** Entrada de 240 ms e saída de 180 ms, com o overlay sincronizado.
- **Painéis que mudam layout** (painel lateral de detalhe, insights, sidebar, collapsible, grupos). Width ou height em 200 ms `--ease-std`; o conteúdo interno tem largura fixa.
- **Toast.** Entrada de 200 ms (translateY de 8 px + opacity) e saída de 150 ms, com a mesma pele do popover (sem as cores padrão do sonner).
- **Conteúdo.** Um único fade de 150 ms por troca loading→conteúdo, **no container** e nunca por linha. Na linha, só quando ela chega em tempo real. Troca entre itens irmãos (j/k, abas) sem fade. `route-enter` e `content-enter` nunca somam.
- **Linha saindo de lista** (snooze, excluir): colapso de altura + opacity, cerca de 150 ms (`grid-rows`).

Layout:

- Raio de 8 px em menus, tooltips e toasts; 12 px em dialog e popover grande.
- Borda `--popover-border` e sombra `--popover-shadow`.
- Item de menu com 32 px de altura, 13 px de fonte, raio de 6–8 px e `px-2.5`.
- `LocationBar` com h-11 e px-2, sem `pl` extra; `ViewBar` com h-[43px]. Todos os headers de detalhe com h-11.
- Texto do corpo em 13 px, inclusive nos sub-itens da sidebar.
- **Linha de propriedade** (issue, projeto, initiative, peek): 32 px, rótulo de 13 px em muted numa coluna de 96 px, valor à esquerda como botão fantasma (hover `bg-accent`, raio de 6 px), e vazio como "Add X" em muted.
- **Datas:** "Mar 20", sem o ano quando for o ano corrente. Strings `YYYY-MM-DD` sempre com `parseISO`.
- **Cores de progresso e health por token:** `--progress-{scope,started,completed}` e `--health-{on-track,at-risk,off-track}`.

## Frentes

### S — Servidor transversal (Codex) · `C:/Projetos/.codex-worktrees/circle-s4-s`

Arquivos: `lib/api/catalogs.ts`, validação zod das rotas `app/api/v1/**` (só os schemas), `lib/api/cycles.ts` + rotas de cycles, `app/api/v1/agent/**` + `lib/api/agent.ts`, `store/issues-store.ts` (só a tolerância a status ausente em `applyDto`).

- [ ] ad#1: invalidar o cache de catálogos em todo create/update/delete de status, label, prioridade e health, também entre pods (LISTEN/`publishInternal` do `catalog`), ou remover o cache se medir que não faz falta. O teste roda com o cache LIGADO. O cliente não lança com status ausente.
- [ ] is#5 e ad#3: `trim()` + `min(1)` em títulos e nomes; `max` (título de issue 512; nomes 128) em todas as rotas de criação e edição, com 400 claro.
- [ ] pl#4: o "New cycle" cria como `upcoming` (ou o front mostra `planned`; decida pelo código e registre); recusar ciclo sobreposto (409 com mensagem); rota e leitura de ciclo completed acessíveis.
- [ ] pl#18: capacidade validada (inteiro ≥ 0) com mensagem clara.
- [ ] co#12: falha do provedor do agent vira 503 com mensagem própria; o chat com falha é persistido marcado como erro, ou o front é avisado (registre).

### M — Motion e primitivos (Claude) · `.claude/worktrees/s4-m`

Arquivos: `app/globals.css`, `components/ui/**` (exceto `sidebar.tsx` fora da fonte), `components/common/detail-side-panel.tsx`, `components/layout/command-palette.tsx` (só a montagem/saída, sem mexer nos grupos), `app/[orgId]/template.tsx`, `components/common/{circle-loading,loading-area,empty-state,error-state}.tsx`, `components/common/settings/shared.tsx` (só o `content-enter` do `SettingsRow`), as linhas que receberam `content-enter` na branch do loading, `components/common/issues/bulk-actions-bar.tsx` (só a animação).

- [ ] vi#1/#2/#5/#8/#11 + tokens: todos os primitivos no sistema acima (popover, dropdown, context-menu com a mesma pele e o mesmo item do dropdown, select, tooltip com delay 300/skip 0, dialog, alert-dialog, command, sheet, sonner com a pele do popover e 200/150 ms, overlay único).
- [ ] vi#4, pl#16, is#21: `DetailSidePanel` sempre montado, width animado de 0 a 400 px em 200 ms; mesmo tratamento no painel de insights.
- [ ] vi#10, co#9: a palette fica montada, com animação de saída; o estado reseta ao fechar.
- [ ] vi#12/#13/#14/#15: política de fade:
   - o `content-enter` sai das linhas e do `SettingsRow` e vai para os containers;
   - troca j/k e troca de item sem fade;
   - `route-enter` sem somar com `content-enter`;
   - uma única instância de loader por área.
- [ ] Utilitário de saída de linha (`list-exit` com `grid-rows`, ~150 ms), documentado para as frentes adotarem.
- [ ] ad#4: padrão "AlertDialog mantém o alvo até fechar" (`useLatchedTarget` ou equivalente) aplicado nos 5 diálogos listados.
- [ ] vi#9: sub-itens da sidebar em 13 px. vi#7: `pl-2.5` extra nos header-nav de members e teams.
- [ ] is#21: a barra de lote entra com fade + translateY.

### I — Issues (Claude) · `.claude/worktrees/s4-i`

Arquivos: `components/common/issues/**`, `components/layout/sidebar/create-new-issue/**`, `components/layout/headers/{issue,issues,my-issues}/**`, `components/common/my-issues/**`, `lib/api/{issues,issue-detail,triage}.ts` (hunks pequenos), `lib/adapters-issue-detail.ts`.

- [x] is#1 a is#25: todos, exceto is#20 (idioma) e is#21 na parte da barra de lote (fica com a M). O drag ganha o fantasma da própria linha e uma linha de inserção de 2 px.
   - Pendência aceita: is#19 só corrigiu a ORDEM do seletor de status (workflow); a
     parte de "contagens globais" ficou de fora — escopar por time exigiria threading
     de `teamId` por ~6 call sites de `StatusSelector`, desproporcional para um
     achado BAIXA.
- [x] Painel de propriedades da issue no padrão da linha de propriedade, com a linha Project sempre presente e editável.
- [x] Atalho de excluir (⌘⌫) + toast com Undo (soft delete no cliente com adiamento do DELETE, ou restore na API; registre).
- [x] Contrato com a C: o painel de propriedades escuta o evento de janela `circle:issue-shortcut` `{ action: 'status'|'priority'|'assignee'|'labels'|'project'|'cycle'|'estimate'|'dueDate' }` e abre o seletor correspondente.

### P — Planejamento (Claude) · `.claude/worktrees/s4-p`

Arquivos: `components/common/{projects,initiatives,roadmap,cycles}/**`, `app/[orgId]/project/**`, `components/layout/headers/{project,initiative,projects}/**`, `lib/api/{projects,project-detail,project-dependencies,initiatives,initiative-detail,roadmap,project-snapshots,project-updates}*.ts` + rotas correspondentes, `lib/client.ts` (métodos novos da P), `lib/timeline-scale.ts`, `lib/issue-breakdown.ts`.

- [x] pl#1 a pl#20, exceto pl#15 (idioma) e a parte de servidor do pl#4 e pl#18 (fica com a S; a P ajusta a UI de ciclos). **Pendência: pl#20** (chip do próprio projeto repetido na aba Issues) precisa de um prop/contexto em `components/common/issues/issue-line.tsx`/`grouped-issues-view.tsx` (frente I) para suprimir o chip quando a lista já está no escopo de um projeto — fora do que a P pode tocar sem invadir os arquivos da I. **Pendência menor: pl#17** — a parte "reordena após arrastar" (a timeline reordena ao vivo quando `ordering` é por data e o arraste muda a própria data-chave) não foi endereçada; exigiria ordem estável por sessão em `projects.tsx`, avaliado como fora do orçamento desta rodada.
- [x] pl#2: sidecar do projeto editável (status/percent, prioridade, lead, members, datas, times, initiatives, labels, health), no padrão da linha de propriedade. Mesmo padrão no painel da initiative e no peek.
- [x] pl#6: `ProjectSidePanel` montado no `app/[orgId]/project/[projectId]/layout.tsx`, com dependências e snapshots guardados no provider.
- [x] pl#11: editar e excluir updates de projeto e de initiative, de ponta a ponta (rotas PATCH/DELETE + serviço + client + UI com menu "…"); health do último update no Overview e no sidecar; update vazio recusado.
- [x] pl#12: tokens `--progress-*` e `--health-*` (declarar em `globals.css` num bloco próprio e registrar para a M).

### C — Comunicação e ferramentas (Claude) · `.claude/worktrees/s4-c`

Arquivos: `components/common/{inbox,reviews,agent,search}/**`, `components/layout/{command-palette.tsx (grupos e busca), keyboard-shortcuts.tsx}`, `components/layout/sidebar/{nav-inbox,nav-favorites,nav-footer}.tsx`, `lib/api/{notifications,favorites,reviews,review-*}*.ts` + rotas, `store/{notifications,favorites,recents,agent-chat}-store.ts`, `lib/client.ts` (métodos novos da C), `lib/shortcuts.ts` (novo).

- [x] co#1 a co#16, exceto a parte de servidor do co#12 (fica com a S) e o co#9 na palette (fica com a M; a C cuida da linha adiada saindo e do dropdown por baixo).
- [x] co#3: paginação da inbox por cursor (`sortAt`, `id`) + excluir notificação (rota DELETE + ⌫ + UI), com carregar mais ou scroll infinito.
- [x] co#5/#6: `lib/shortcuts.ts` como tabela única que alimenta o listener, as dicas da palette e o painel `?`. As teclas da issue disparam `circle:issue-shortcut` (contrato com a I).
- [x] co#16: reordenar favoritos por arraste na sidebar (usa `position`).

Contratos entregues pela C (para as outras frentes):

- **`circle:issue-shortcut`** (evento de janela, `{ action }`, **`cancelable`**): quem abrir o
  seletor precisa chamar `event.preventDefault()`. Sem isso, o listener global entende que
  ninguém tratou e abre o ⌘K na sub-página equivalente — e os dois abrem juntos. Ações:
  `status | priority | assignee | labels | project | cycle | estimate | dueDate`.
- **`circle:open-command`** aceita `detail.page` (`status`, `priority`, `assign`, `labels`,
  `project`, `cycle`, `due-date`) para abrir a paleta direto na sub-página.
- **`circle:open-shortcuts`** abre o painel `?` (hospedado no `KeyboardShortcuts`).
- **Inbox:** `GET /inbox` aceita `limit`/`cursor` e devolve `meta.nextCursor` (`data` segue
  sendo o array); `DELETE /notifications/:id` exclui a do próprio destinatário.
  `PATCH /favorites { order }` grava a ordem dos favoritos.

Pendências registradas: "Reviewed" do diff continua **local** (localStorage) e colapsa sem
animação — persistir exigiria coluna nova (migration é da A); chat do Agent com falha some no
reload (persistência é da S, co#12).

### A — Administração e conteúdo (Claude) · `.claude/worktrees/s4-a`

Arquivos: `components/common/{teams,members,views,settings}/**` (exceto `settings/shared.tsx` na parte da M), `app/[orgId]/settings/**`, `app/[orgId]/team/**`, `lib/api/{teams,members,invites,views,settings,import,export,webhooks,templates,emojis,documents,labels,statuses}*.ts` + rotas, `db/schema.ts` + `db/migrations/**` (**única frente que gera migration**), `components/layout/sidebar/**` (hierarquia de times, exceto os arquivos da C), `lib/client.ts` (métodos novos da A).

- [ ] ad#2 a ad#14 (o ad#1 fica com a S). E2E da exclusão em cascata: nome vazio, eventos e outras abas.
- [ ] ad#8 + vi: todas as telas de settings em `SettingsShell` + `SettingsCard`; coluna de 640 px; ações do header `sm` no canto; título que quebra sem passar por baixo das ações; `truncate` nas rows.
- [ ] **Corpo de documento:** página do documento com o editor de blocos (`descriptionDoc`/ProseMirror, como issue e projeto), coluna nova via migration, autosave com concorrência otimista (padrão `descriptionVersion`), evento com `teamId`, linhas da lista abrindo o documento, pastas renomeáveis e excluíveis.
- [ ] **Grupos de label:** CRUD de grupo (`label.groupId` já existe; criar a tabela de grupo, se faltar), UI em settings com label exclusiva por grupo, seletores de label mostrando os grupos (coordenar com a I: exponha no catálogo e registre).
- [ ] **Hierarquia de times:** sub-times aninhados na sidebar e em /teams, com colapsar e expandir; a seção "Team hierarchy" das settings passa a funcionar.
- [ ] ad#7: settings do time sem rows mortas (implementar as que forem simples ou esconder); editar time com cor e identificador; Enter salva; Cancelar; edição possível no mobile.

### Integração (Claude, checkout principal)

- [ ] Merge S → M → I → P → C → A, resolvendo conflitos; a migration única da A por último.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [ ] Rebuild do `s4-e2e` com o código integrado e remedição dos achados alta e média por módulo (reusar os scripts de `audit4/<sigla>/`) → atualizar o spec (seção "Remedição") → PR.
