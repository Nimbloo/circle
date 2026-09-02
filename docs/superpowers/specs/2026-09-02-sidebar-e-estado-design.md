# Sidebar, filtros e estado do front — de-para com o Linear

**Data:** 2026-09-02

**Status:** concluído (PR para `develop` em 2026-09-02)

## Origem

Pedido: "a sidebar precisa estar com os efeitos visuais do Linear (clicar em um time abre e
fecha tudo sem nenhum efeito)", "veja se os filtros estão funcionais", "pente fino na
arquitetura do front para ver essa questão dos estados", e de-para do painel de initiatives.
O Linear é o benchmark. Nesta sessão o Chrome bloqueou `linear.app` para a extensão, então
o de-para pixel a pixel do painel de initiatives fica para quando a permissão for dada; o
que segue usa medições anteriores (spec de 2026-09-01) e o comportamento conhecido do Linear.

## Auditoria (read-only, 2026-09-02) — achados

**Crítico**

1. `workspace.hydrate()` após mutação pequena baixa o bootstrap inteiro **e** roda o
   auto-rollover de cycles (escrita) em todos os times: `lib/client.ts` só manda
   `?rollover=0` quando `rollover === false`, e ~25 call sites não passam nada.
2. `workspace-store.hydrate` faz `if (loading) return` — um refetch SSE em voo engole o
   refresh pós-mutação; a UI pode ficar com snapshot antigo.
3. "Show sub-issues" (display options) não tem consumidor: liga/desliga e nada muda.

**Importante**

4. Filtros `Project is not X`, `Created by is not X` e datas excluem issues **sem** o
   valor (accessor `''` + `if (!inputData) return false`).
5. Filtros de issues vivem só em `?filters=` e somem ao trocar de tab (All → Active): os
   `Link` das tabs não propagam a query. Linear lembra por view.
6. Display settings (grouping/ordering/propriedades) são um único conjunto global em
   localStorage: escolha no board do time A vaza para cycle, project, my-issues.
7. `right-panel-store` (Insights/Properties) é global e não reseta ao trocar de rota.
8. Painéis laterais de Initiative / Project / Issue divergem (toggle persistido só na
   initiative; larguras/breakpoints e Sheet mobile diferentes; Properties duplicado inline
   - aside em initiative e project).
9. Sidebar (HEAD): `key={item.name}`, `defaultOpen={index === 0}` sem persistência e
   `CollapsibleContent` sem animação — abre/fecha seco.

**Menor:** `groupByKey` O(n²); `isDefault` do Display ignora 3 campos; `usePanelFilter`
desacoplado da URL após reload; `ProjectsSection` sem memo; `GroupedIssuesView` assina o
store inteiro.

## Decisões desta fatia

- **Sidebar (Linear):** conteúdo do time anima altura + opacidade em 200 ms
  (`cubic-bezier(0.2,0,0,1)`), chevron gira 90°, estado expandido **persistido por time**
  (`sidebar-teams` em localStorage; só o 1º time começa aberto), `motion-reduce` desliga.
- **Estado:** `hydrate` do workspace passa a coalescer chamadas concorrentes (promise em
  voo + re-execução única) e o cliente só roda rollover quando explicitamente pedido
  (`DataHydrator`). Call sites pós-mutação continuam funcionando, só ficam mais baratos.
- **Filtros:** valor ausente vira opção explícita ("No project", "No creator", "No due
  date") e `is not` é verdadeiro para ausente. Tabs do header propagam `?filters=`.
- **Display options:** remover "Show sub-issues" até existir consumidor (honestidade > UI).
- **Fora desta fatia (registrar em PENDENCIAS):** display settings por view, unificação dos
  painéis laterais (`DetailSidePanel`), `right-panel-store` por rota, sync servidor das
  preferências de layout, de-para pixel do painel de initiatives (precisa de linear.app).

## Aceitação

- Testes: store da sidebar; coalescência do `hydrate`; filtros com valor ausente; tabs
  preservando `?filters=`.
- `pnpm typecheck`, `lint`, `test`, `build`, `git diff --check` verdes; guard do dev seam.
- Smoke no Chrome: clicar no time anima (altura amostrada em passos, não 0→h num frame),
  estado sobrevive ao reload, filtro `Project is not X` mantém issues sem projeto.
