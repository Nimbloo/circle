# Teste de sanidade 4: achados consolidados (2026-09-19)

Base: `danilo/sanity-audit-4` @ `50f57a8` (loading padrão com o Circle girando, sobre o PR #171).

**Fontes**

- 4 agentes de E2E (Playwright, cada um com build de produção e banco próprios, clonados do `circle_perf` com ~3.000 issues): issues (`is`), planejamento (`pl`), comunicação (`co`) e administração (`ad`).
- 1 curador visual (`vi`), que mediu motion e layout.
- Codex, que gerou os cenários provocativos (`codex-provocations.md` no scratchpad; os que foram reproduzidos estão citados nos relatórios).

**Referências**

- Evidências (scripts, screenshots, vídeos) em `%TEMP%/claude/C--Projetos-circle/9db28257-7287-4294-9200-7e3025940364/scratchpad/audit4/<sigla>/`.
- IDs no formato `is#N`, `pl#N`, `co#N`, `ad#N`, `vi#N`.
- Idioma pt/en na UI: vale a decisão anterior (fica como está e não é reportado).

**Os mais graves**

- `ad#1`: o cache de catálogos (TTL de 30 s) não invalida quando status ou labels mudam. A issue volta sem status e o cliente quebra. Verificado no código.
- `pl#2`: o sidecar do projeto é somente leitura. É a causa da queixa "sem efeito".
- `pl#1`: o clique na barra da timeline não abre o peek.
- `pl#3`: a initiative esconde projetos Planned e Canceled.
- `is#1`: a triagem fica inutilizável porque a fila empurra a lista para fora.
- `is#2`: editar um comentário apaga listas e blocos.
- `is#3`: a lixeira do comentário-raiz apaga a thread inteira sem confirmação.
- `is#4`: o modal de criação cresce para fora da tela.
- `vi#1–5`: não há sistema de motion. São 5 curvas e 8 durações, com escala a partir do centro, sheet de 500 ms, painel lateral sem transição e toast fora do tema.

## Curador visual (vi, 3105) — resumo do relatório

Evidências: audit4/vi/ (s1..s4.txt, PNGs, strip-\*.png). Sem pageerror/console.error.

Estado medido: 5 curvas e 8 durações diferentes; nenhuma saída mais rápida que a entrada.

Achados:

1. média · Popover/Dropdown/Select/Tooltip escalam a partir do CENTRO da caixa, não do trigger → `origin-(--radix-*-content-transform-origin)` (ui/popover.tsx:29, dropdown-menu.tsx:36/204, select.tsx:54, tooltip.tsx:45).
2. média · tudo 150/150 ms `ease`; slide-in-from-\* não faz nada → tokens de motion nos 7 primitivos.
3. média · Sheet 500 ms entrada / 300 ms saída; overlay 150 ms (ui/sheet.tsx:55) → 240/180 ms, overlay sincronizado.
4. média · painel lateral de detalhe (detail-side-panel.tsx `{open && <aside>}`) entra/sai seco e empurra o conteúdo 158 px (CLS 0,038); insights idem → aside montado, width 0↔400 em 200 ms, conteúdo largura fixa.
5. média · toast ignora tokens (fundo #000, borda #333, raio 8, 400 ms) (ui/sonner.tsx:15) → vars do sonner / unstyled.
6. média · Projects 1440px: "Target date" sobrepõe a coluna Issues (project-line.tsx:148, projects-list.tsx:26) → w-[120px] + truncate / formato curto.
7. média · título/botão do header pula 10 px entre telas irmãs (x289 vs x299: members/teams header-nav pl-2.5) → LocationBar como fonte única de padding.
8. média · ContextMenu destoa do Dropdown (raio 6, borda --border, shadow-md, item 14px r4) (ui/context-menu.tsx) → mesmas classes do dropdown.
9. baixa · sub-itens da sidebar 14px vs 13px (ui/sidebar.tsx:660).
10.   baixa · command palette fecha seco (desmonta, command-palette.tsx:115).
11.   baixa · Create issue rounded-[21px] bg-card shadow-xl vs 12px/popover nos outros; overlays black/50 vs black/80.
12.   baixa · deep-link frio com rede lenta: loader trocado 3×, route-enter 2×, header entra depois (+44px, CLS 0,025).
13.   baixa · inbox j/k remonta preview com fade + loader a cada tecla (issue-preview.tsx:151).
14.   baixa · route-enter inconsistente entre seções de topo (template.tsx parentOf); route-enter × content-enter somados deixam a lista ~100 ms invisível → só um fade por troca.
15.   baixa · content-enter por linha em 12 listas multiplica animações → no container; por linha só na entrada em tempo real.
16.   baixa · painel de propriedades começa em y53 (issue) vs y96 (project/initiative); header do inbox com border-border cheio e pl-[18px].

OK: reduced-motion; collapsible; sem CLS em popover/dialog; headers 44/43 px em 14 telas; mobile 390 sem scroll horizontal.

Proposta (tokens em :root + @theme):
--ease-out: cubic-bezier(0.16,1,0.3,1); --ease-in: cubic-bezier(0.4,0,1,1); --ease-std: cubic-bezier(0.2,0,0,1);
--dur-instant 80ms (hover/cor/foco); --dur-fast 120ms (saída popover/menu/tooltip); --dur-base 160ms (entrada popover/menu/select/tooltip); --dur-modal 200ms (dialog/palette; layout de painel/sidebar/collapsible); --dur-sheet 240ms (saída 180); --dur-content 150ms; --scale-pop .97; --scale-modal .98; --shift-pop 4px.
Regras: menus/popovers entrada 160 ease-out opacity+scale .97+4px do lado do trigger, saída 120 ease-in; origem radix. Tooltip delay 300/skip 0. Dialog/palette 200/120, overlay único rgb(0 0 0/.4), palette montada. Sheet 240/180. Painéis de layout width/height 200 ease-std. Toast 200 entrada translateY 8px / 150 saída, pele do popover. Conteúdo: um fade por troca, 150 ms, no container; troca entre itens sem fade; loader delay 150 ms, instância única. Micro 80 ms.
Layout: raio 8 (menus/tooltip/toast) e 12 (popover grande/dialog); borda --popover-border; sombra --popover-shadow; padding 4px menus; item 32px/13px/r6-8/px-2.5; LocationBar h-11 px-2 sem pl extra; ViewBar h-[43px]; corpo 13px inclusive sidebar; títulos settings 24/500; painéis de propriedades 400px abaixo do mesmo header.

## E2E Issues (is, 3101) — resumo

Evidências: audit4/is/ (33 scripts). Sem pageerror. Banco 3101 tem issues "E2E-IS" (ENG-1513..1520) e uma view.

OK: agrupamentos/ordenação/virtualização (≤70ms), filtros, criar (⌘Enter, create more, duplo envio, falha de rede, rascunho), edição inline e rajadas de labels, arrastar/reordenar, J/K e anterior/próxima, deep-link frio, anexos com falha parcial, tempo real 2 abas, views.

1. ALTA · Triagem inutilizável: 169 cards "Suggested" (39k px) em pai overflow-hidden; lista com altura 0 (triage-suggestions-queue.tsx) → max-h/overflow-auto ou fila colapsável.
2. ALTA · editar comentário apaga listas/blocos (activity-feed.tsx:123-128 blocksToText só paragraph; usado em :210 e convert to sub-issue :282).
3. ALTA · lixeira do comentário-raiz apaga a thread inteira sem confirmação/undo (activity-feed.tsx:240,415; issue-detail.ts:789-798).
4. ALTA · modal de criação cresce para fora da tela com descrição longa (create-new-issue/index.tsx:136 top-[23.8%] translate-y-[-50%] sem max-h).
5. MÉDIA · título só com espaços cria issue em branco (index.tsx:104,223; issues route min(1) sem trim).
6. MÉDIA · criar a partir de issue de outro time cai em ENG; modal sem seletor de time (index.tsx:38).
7. MÉDIA · due date 1 dia antes na lista em UTC−3 e sempre vermelha (issue-line.tsx ~219 new Date) → parseISO; cor só vencida/perto.
8. MÉDIA · activity mostra UUID do ciclo e não mostra de/para de status/prioridade (issues.ts:1140-1156).
9. MÉDIA · pickers de relação/issue renderizam 3.015 itens (443ms long task; 36 long tasks ao digitar) (relation-editor.tsx, issue-picker.tsx:~84) → limitar/buscar no servidor; relação sem identifier.
10.   MÉDIA · seleção em lote invisível no board; Esc não limpa; sem Shift-intervalo (issue-grid.tsx, bulk-actions-bar.tsx).
11.   MÉDIA · editar título: salto de 64px (textarea rows=1) e Shift+Enter grava \n.
12.   MÉDIA · projeto não editável no detalhe da issue (issue-properties-panel.tsx).
13.   BAIXA · painel de propriedades inconsistente (chips vs ghost, raios 6/8, 13 vs 14px, labels duplicadas).
14.   MÉDIA · voltar do detalhe perde scroll da lista (virtual-issue-list.tsx) → guardar offset por viewKey.
15.   MÉDIA · colar várias sub-issues com falha no meio perde as restantes e duplica ao repetir; sem maxLength (sub-issue-create.tsx:28-55).
16.   BAIXA · "Delete… ⌘⌫" anunciado sem handler; delete sem Undo; header do detalhe sem Delete.
17.   BAIXA · My issues › Activity mostra contagem de Subscribed (headers/my-issues/header.tsx:106).
18.   MÉDIA · toolbar estoura em 390px; breadcrumb "E › ›" no detalhe mobile.
19.   BAIXA · seletor de status fora da ordem do workflow e contagens globais (property-options.tsx:48-70).
20.   BAIXA · idioma misturado (Filtro/é/Limpar vermelho/Criar issue); botão Filtro encolhe com filtro ativo.
21.   BAIXA · transições: barra de lote seca; toggle do painel do detalhe instantâneo (786→1186px); sheet 500ms; saídas = entradas; drag na lista usa card do board como fantasma, sem linha de inserção; overlay "Move to X" cobre a coluna; troca para Manual sem aviso.
22.   BAIXA · composer: foco vai pro body após enviar; edição sem Ctrl+Enter/Esc.
23.   BAIXA · header da Triagem diz "Issues" sem aba ativa; issue de triagem adiada some de All issues sem como ver/desfazer.
24.   BAIXA · Display › Reset não volta layout board; "+" em coluna não-status não pré-preenche.
25.   BAIXA · popover Display com vão (seção fixa 81px, min-h 541px).

Codex: I1→#5, I7→#15, I10→#3 reproduzidas; I2,I3,I5,I6,I9 OK; I4,I11 parciais; I12 inconclusivo.
Padrões: entrada 160 ms (0.2,0,0,1) opacity+scale .97; saída 100 ms ease-in; sheet/painel 200 ms; barra de lote fade+translateY 8px 160ms; drag com fantasma do item e linha de inserção 2px primary; PropertyRow ghost 28px r6 13px.

## E2E Planejamento (pl, 3102) — resumo

Evidências: audit4/pl/. Sem pageerror. Dados de teste removidos.

OK: board arrastar (1 PATCH), timeline arrastar/redimensionar/teclado, zoom rápido ancorado, criar projeto duplo clique = 1 POST, excluir em outra aba, milestones ao vivo, status/prioridade de outra aba no sidecar, updates postar, initiative propriedades/parent/mover projeto, rascunho de update após erro, burn-up, deep-link frio aceitável.

1. ALTA · clique na barra da timeline nunca abre o peek (setPointerCapture desvia o click) (projects-timeline.tsx:216-222, 318-321) → capturar só após mover / abrir no pointerup sem mover.
2. ALTA · SIDECAR DO PROJETO É SOMENTE LEITURA ("sem efeito algum"): Status, Priority, Lead, Members, Dates, Teams, Initiatives, Labels são texto; sem Health (project-properties-panel.tsx:265-370,176-185) → reutilizar HealthPopover/PrioritySelector/LeadSelector/DatePicker/StatusWithPercent do project-line.tsx:120-172 com patchProject.
3. ALTA · projetos Planned/Canceled somem da seção Projects da initiative (initiative-details.tsx:56-65 usa 'unstarted'; categorias reais 'planned'/'canceled' em seed-catalogs.ts:68,83).
4. MÉDIA-ALTA · ciclo criado pelo New cycle nasce 'planned' → inacessível (upcoming vazio, linha não clicável); ciclos completed não abrem; servidor aceita ciclo sobreposto (cycles.ts:597, cycle-line.tsx:33-38, workspace-store.ts:536-538).
5. MÉDIA · ícone da initiative aparece como texto "target" (project-properties-panel.tsx:332, project-peek-panel.tsx:200, roadmap-timeline.tsx:561-562) → InitiativeGlyph.
6. MÉDIA · trocar aba/reabrir remonta o sidecar (fade, 2 GETs deps/snapshots, "No dependencies" enquanto carrega, pulo 12px) — ProjectSidePanel por página (project-overview.tsx:242, project-issues.tsx:76, project-activity.tsx:305) → montar no layout.tsx do projeto e guardar deps/snapshots no provider.
7. MÉDIA · clique em breakdown/Insights fora da aba Issues sem efeito (use-panel-filter.ts, project-properties-panel.tsx:533-539) → navegar para /issues?filters=.
8. MÉDIA · Depends on não atualiza ao vivo (project-dependencies-picker.tsx:27-40).
9. MÉDIA · data alvo invade a coluna Issues (project-line.tsx:147-160 w-[92px], 'MMM dd, yyyy') → 'MMM d' ou 120px.
10.   MÉDIA · roadmap: barra/nome não abrem o projeto; zoom perde a posição (hoje fora da tela); Week sem ano; sem Today (roadmap-timeline.tsx:176-195, 436-445) → ancoragem do projects-timeline.
11.   MÉDIA · updates (projeto e initiative) não editam/excluem; health do último update não aparece no Overview/sidecar; initiative aceita update vazio.
12.   MÉDIA · cores inconsistentes da mesma métrica (Started roxo/amarelo; At risk roxo vs amarelo) (project-properties-panel.tsx:492, project-snapshot-chart.tsx:16, project-progress-chart.tsx:17, initiative-details.tsx:521) → tokens --progress-_/--health-_.
13.   BAIXA-MÉDIA · 4 painéis de propriedades com 4 layouts (projeto justify-between 28px; initiative/peek coluna 96px; peek 32px/14px; initiative 32–40px) → padrão Linear.
14.   BAIXA · abas do header invertidas projeto × initiative; projeto sem menu de ações.
15.   BAIXA · pt no meio do en (timeline SET./OUT., initiative "Descrição/Publicar update", ciclo "Filtro", "Payload inválido"); descrição da initiative não editável e repete o resumo.
16.   BAIXA · sidecar e peek sem animação (detail-side-panel.tsx:126, pulo 159px).
17.   BAIXA · timeline: largura mínima 130px distorce datas; linha de hoje sobre o texto; linha 72px vs roadmap 56px; reordena após arrastar.
18.   BAIXA · capacidade vazia vira 0; -1/12,5/1e309 → "Payload inválido"; 4 Enters = 4 toasts.
19.   BAIXA · criar projeto sem ⌘Enter; Esc descarta rascunho; atalhos Y/Q/M/W agem com dialog aberto.
20.   BAIXA · aba Issues do projeto repete o chip do próprio projeto e quebra em 2 linhas.

Padrões: linha de propriedade 32px, rótulo 13px muted em coluna 96px, valor à esquerda como botão fantasma, vazio "Add X"; tokens de progresso/health; sidecar width ~200ms ease-out, saída ~150; peek fade+translateX 8px 150ms; datas "Mar 20".

## E2E Comunicação (co, 3103) — resumo

Evidências: audit4/co/. Sem pageerror. Banco 3103: githubLogin=danilosimei gravado; não lidas 174→39.

OK: inbox carga/fade, abrir/lida/não lida (2 abas convergem), redimensionar pane, filtros, mark all com rollback, tempo real; palette (debounce, Tab→Agent); favoritos add/remove/tempo real; recentes; reviews abas/colapsar grupo/carregar mais/diff/comentar/rollback; agent chats fora de ordem.

1. média · j/k na inbox não rola até a seleção (inbox.tsx:238-260) → scrollIntoView nearest.
2. média · Show read off: abrir marca lida → item sai → j/k volta ao topo (inbox.tsx:207, 252-254) → manter selecionado visível no filtro.
3. média · inbox mostra só 100 de 300 (DEFAULT_INBOX_LIMIT, notifications.ts:99,118; client.ts:543 sem offset) e não há excluir notificação → paginação por cursor sortAt + DELETE.
4. média · ⌘K numa página de issue não busca/navega (command-palette.tsx:387,540 route==='root' && !issue) → grupos de busca/navegação também com issue.
5. média · atalhos da palette não batem com os reais (G I/G M/G S; teclas da issue A/S/P/L não fazem nada) (keyboard-shortcuts.tsx:27-35 × command-palette.tsx:398-534,702-729) → tabela única de atalhos + implementar teclas da issue.
6. baixa · sem ajuda de atalhos (`?`), "Help & shortcuts" só abre a palette.
7. média · Reviews "vazio" sem githubLogin (71 PRs no banco) → empty state "Configure seu GitHub em Profile".
8. baixa · hint "Perguntar ao Agent / Tab" sobrepõe o texto (command-palette.tsx:342-349) → pr-40.
9. baixa · saídas secas: palette desmonta (command-palette.tsx:115), linha adiada some seca; palette sobre dropdown aberto deixa o menu aberto.
10.   média mobile · inbox sem histórico (goBack → about:blank), snooze só por hover, 2 headers (88px) (inbox.tsx:516-536) → seleção na URL + snooze no header do preview.
11.   baixa · header do detalhe de review h-10 vs h-11 (review-detail.tsx:146); "Resolves" com href vazio (review-overview.tsx:198-200, 404 prefetch); diff-view.tsx:100 "pom.xml /" path vazio; "1 files changed"; falha de rede = "Review not found".
12.   baixa · agent: Bedrock falha → 500 cru e mensagem culpa a rede (agent-chat.tsx:248); chats com falha somem no reload; Esc em sub-página da palette fecha tudo (command-palette.tsx:326-330).
13.   baixa · snooze sem Desfazer; "Amanhã" = +24h; mistura pt/en; Reviewed colapsa sem animação e é só local.
14.   baixa · snooze remoto da notificação aberta esvazia o preview (applyNotificationPatch zera selectedNotification).
15.   baixa · `/` fora de lista de issues liga busca "em segredo" (keyboard-shortcuts.tsx:64).
16.   baixa · favoritos sem reordenar (position existe), POST falho sem toast (favorites-store.ts:120-124), estrela roxa vs âmbar; linhas da inbox sem tabindex.

Padrões: saída overlay 100–120 ms ease-in; linha saindo: colapso grid-rows ~150 ms; headers h-11 13px/500; SidebarTrigger padronizado; registro único de atalhos.

## E2E Administração (ad, 3104) — resumo (build 50f57a8, sem a cascata)

Evidências: audit4/ad/. Banco 3104: times ADD/AD2 (pasta vazia), ENG-8 In Progress, accent custom #ff0000.

OK: criar time e validações, sair do time, docs realtime, membros desativar/reativar/perfil, join requests 2 abas, membros do time, preferências persistem, tema (importar inválido/válido), labels CRUD/duplicata/realtime, status CRUD, SLA validado, automação abre, webhooks CRUD/entregas/redeliver, views.

1. ALTA · cache de catálogos (TTL 30s, "semeados e fixos") com status/labels editáveis: issue em status recém-criado volta SEM status → pageerror em applyDto; label nova some do DTO até 30s (catalogs.ts:40-69; issues.ts:439 statuses.get(...)!) → invalidar em CRUD (LISTEN) ou remover cache; cliente tolera status ausente.
2. ALTA (fluxo antigo) · exclusão recusa com 409 mas o diálogo promete excluir; pasta vazia bloqueava para sempre (sem UI/API de excluir pasta); nome vazio via PATCH " " libera excluir com campo vazio. Cascata 04f5a08 resolve o bloqueio; falta E2E dela (nome vazio, textos, outras abas).
3. MÉDIA · nome/URL longos: h1 do SettingsShell passa por baixo das ações absolutas; URL de webhook estoura card; nome >128 → 500 (sem maxLength/z.max) (settings/shared.tsx:31-43, SettingsRow sem truncate).
4. MÉDIA · AlertDialog: título esvazia na saída ("Delete label “”?") ~125ms (issue-labels-settings.tsx:326, issue-templates-settings.tsx:330, project-statuses-settings.tsx:348, project-templates-settings.tsx:349, team-documents.tsx:262) → manter alvo em ref até fechar.
5. MÉDIA · progresso do import se perde ao sair da tela; 0% por 2s e degraus de 17% (import-export-settings.tsx:122-140) → recuperar job ativo ao montar.
6. MÉDIA · documentos: linhas não abrem, sem corpo; pastas sem renomear/excluir; Create desabilitado sem explicar (falta pasta); ícone maxLength 2 corta emoji composto; erro sem retry.
7. MÉDIA · settings do time: sub-time só no select (sem aninhamento; "Team hierarchy" vazia); rows mortas (General, Members, Labels, Templates, Recurring, Slack, Triage, Agents); "1 members"; editar sem cor/identificador, select nativo, Enter não salva, sem Cancelar, maxLength 4 corta emoji; mobile sem "Editar" (team-settings.tsx).
8. MÉDIA · 3 famílias de layout em settings (640px central; px-14 página inteira em Labels/Emojis; cards próprios r8+borda em Templates/Statuses/Pulse/Audit vs SettingsCard r10); ações do header variam; "Projects › Statuses" abre "Issue statuses"; label.groupId sem UI; mobile SidebarTrigger encolhe (h1 x38↔x50).
9. BAIXA · convites seguidos: 2º e-mail apagado por setEmail('') e não enviado (invite-panel.tsx:78-90).
10.   BAIXA · criar label duplicada → unhandled rejection (issue-labels-settings.tsx:78-89 try/finally sem catch).
11.   BAIXA · toasts genéricos escondem o motivo do servidor (webhook destino privado, key de time, emoji 503, labels 500).
12.   BAIXA · segredo do webhook some com Esc sem confirmar; copiar ignora falha; webhook desativado deixa o switch também com opacidade .6.
13.   BAIXA · remover membro/excluir emoji/revogar convite sem confirmação; "Add a description..." falso; linha do membro repete nome.
14.   BAIXA · preferências só sincronizam no reload; "Underline links" sublinha a sidebar.

(Idioma pt/en: decisão anterior do usuário = não reportar/mexer.)
Padrões: dialog entrada 150–180 (0.2,0,0,1) scale .98, saída 100–120 ease-in; toast ~200ms; saída de linha colapso 120ms; settings: SettingsCard único r10, coluna 640px, row 13px truncate, ações sm no canto.

## Exclusão de time em cascata — integrada em 04f5a08 (merge de danilo/s4-team-delete)

Commits: 8a2759a (serviço cascata + impacto), 43d4d46 (store poda), 132237c (DeleteTeamDialog único).
Contrato novo aditivo: GET /api/v1/teams/:key/deletion-impact (admin) → {issues,projects,cycles,views,folders,documents}; DELETE não dá mais 409 por conteúdo.
Cascata em transação cobre todas as FKs; outros times só perdem vínculo; storage de anexos após commit; eventos coarse após commit (team deleted único nos webhooks).
Pendências: eventos extras notification/favorite por usuário e initiative.updated; audit sem contagens; identificador do time em texto (review.resolves_identifier, audit target, user_settings) não tocado; teste de UI não foi visto falhando antes.

## Remedição após as correções (2026-09-19)

Build de produção do código integrado (`danilo/sanity-audit-4`), banco clonado do `circle_perf` com as 52 migrations aplicadas, Playwright. Roteiro: `audit4/remed.js`, no scratchpad. Cada item foi conferido no navegador ou na API pelo integrador, e não só pelo relatório das frentes.

| Achado                      | Resultado                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| ad#1 cache de catálogos     | um status recém-criado aparece na mesma hora no PATCH e no GET da issue ✅                   |
| pl#2 sidecar do projeto     | a prioridade abre o seletor e grava (`High → Urgent`, PATCH 200) ✅                          |
| vi#4 / pl#16 painel lateral | a largura anima 400 → 65 → 0 px, sem salto ✅                                                |
| pl#1 timeline               | o clique na barra abre o peek ✅                                                             |
| is#1 triagem                | a lista fica visível (774 px) e a fila de sugestões tem rolagem própria (360 px) ✅          |
| is#3 exclusão de thread     | o diálogo avisa "This comment and its 2 replies will be permanently deleted" ✅              |
| is#4 modal de criação       | com 45 linhas de descrição, fica dentro da tela (y = 108, h = 684) e o botão é alcançável ✅ |
| is#5 título em branco       | a API responde 400 ✅                                                                        |
| pl#4 ciclos                 | ciclo novo nasce `upcoming`; ciclo sobreposto responde 409 ✅                                |
| co#3 inbox                  | paginação por cursor, 100 + 100 notificações sem repetir ✅                                  |
| co#4 ⌘K numa issue          | busca e navega ✅                                                                            |
| co#5 / co#6 atalhos         | `S` abre só o seletor de status (a palette não abre junto); `?` abre o painel ✅             |
| vi#1 popover                | a origem do transform fica no trigger (`302px 0px`); a entrada leva 160 ms ✅                |
| vi#5 toast                  | usa a pele do tema (fundo e borda por token, raio de 8 px, 200 ms) ✅                        |
| Exclusão de time em cascata | o impacto lista o conteúdo, o DELETE apaga tudo e o time some (404) ✅                       |

**Correções feitas na integração**, além das entregas das frentes:

- **Undo da exclusão de issue:** se o DELETE falhar, a issue volta para a lista; sair da página dentro da janela envia o DELETE na hora, com `keepalive`; o toast dura exatamente a janela de desfazer.
- **Cache de catálogos:** guarda de geração, para uma leitura em voo não regravar dado anterior à invalidação.
- **Diálogos de exclusão:** os 7 usam `useLatchedTarget`.
- **Rotas de validação:** a versão da S (com `trim` e mensagens claras) somada ao limite de ícone da A.

**Verificação final:** `pnpm test` com 373 arquivos e 1.881 testes, exit 0; `pnpm typecheck`, `pnpm lint` e `pnpm build` limpos; `db:generate` sem mudança pendente (migration `0051`, só aditiva).

**Não remedido no navegador** (coberto só por testes automatizados das frentes): achados de severidade baixa, o mobile e as lacunas novas (corpo de documento, grupos de label, hierarquia de times, editar/excluir updates, reordenar favoritos).
