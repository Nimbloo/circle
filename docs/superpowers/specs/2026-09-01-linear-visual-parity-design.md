# Paridade visual do Circle com o Linear 2026

**Data:** 2026-09-01

**Status:** proposta para revisão

**Issue:** [#65 — paridade visual com o Linear 2026](https://github.com/Nimbloo/circle/issues/65)

**Épico relacionado:** [#25 — lacunas de paridade com o Linear](https://github.com/Nimbloo/circle/issues/25)

## Objetivo

Atualizar a interface do Circle para reproduzir com alta fidelidade o sistema visual e a
hierarquia de interação do Linear atual, preservando as funcionalidades, os contratos de
API e a arquitetura de dados existentes.

O resultado deve parecer uma única aplicação coerente: mesma densidade, proporções,
ritmo vertical, contraste, estados e comportamento nas telas principais, em dark e light.

## O que significa "idêntico"

O Linear será a referência de produto, não uma fonte de código ou de dados. A comparação
usa três fontes:

1. o workspace Nimbloo autenticado, somente para observar geometria e comportamento;
2. o [UI refresh de março de 2026](https://linear.app/changelog/2026-03-12-ui-refresh);
3. a documentação oficial de [display options](https://linear.app/docs/display-options)
   e das superfícies específicas.

Fidelidade inclui:

- shell, sidebar, barras de localização e de visualização;
- tipografia, cores, elevação, bordas, raios e iconografia;
- espaçamento, densidade de linhas e alinhamento de metadados;
- estados hover, active, focus, selected, loading, empty e error;
- menus, popovers, dialogs, command menu e transições;
- comportamento responsivo equivalente, adaptado às rotas do Circle.

Não serão copiados textos, dados, imagens privadas ou código do Linear.

## Fora do escopo

- implementar funcionalidades ainda ausentes do épico #25;
- alterar DTOs, endpoints, autenticação, schema ou regras de negócio;
- reescrever o frontend ou trocar Tailwind, Radix, Zustand ou o roteamento;
- criar um design system paralelo ao conjunto de tokens e componentes existente;
- refatorar módulos vizinhos apenas por conveniência.

Se uma diferença visual depender de uma mudança de contrato, o trabalho para e a
decisão volta ao usuário antes de qualquer alteração.

## Diagnóstico do estado atual

O Circle já possui boa parte da base necessária: sidebar de 244 px, inset do conteúdo,
tema por tokens, Radix/shadcn, Lucide, linhas de issue compactas e stores separados por
domínio. A atualização deve evoluir essa base, não substituí-la.

As divergências mais relevantes encontradas são estruturais:

| Área     | Circle atual                                                               | Linear 2026                                                                  |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Shell    | Conteúdo insetado, mas com raio e bordas inconsistentes entre páginas      | Superfície principal única, raio de 12 px e borda muito suave                |
| Sidebar  | Largura correta, porém ícones/textos mais fortes e menor respiro vertical  | Navegação mais silenciosa, ícones menores e grupos mais espaçados            |
| Headers  | Cabeçalhos duplicados por área e combinações diferentes de altura/controle | Location bar e view bar consistentes, compactas e reutilizadas               |
| Issues   | Densidade próxima, porém mais separadores e grupos mais ruidosos           | Linhas densas, grupos elevados suavemente e metadados discretos              |
| Inbox    | Divisão vazia em 50/50 e dois empty states concorrentes                    | Lista de notificações com largura fixa e painel de detalhe dominante         |
| Detalhes | Conteúdo e propriedades variam por entidade                                | Coluna editorial principal e painel de propriedades sem chrome de card       |
| Settings | Header global e navegação com aparência de formulário separado             | Sidebar própria, conteúdo estreito centralizado e cartões de seção sutis     |
| Temas    | Paleta próxima ao Linear anterior                                          | Neutros mais quentes, menos bordas e contraste de superfície mais controlado |

Também foi encontrado um bloqueio de reprodutibilidade local: `pnpm db:migrate` e
`pnpm db:seed` não carregam `.env.local`, embora o README instrua o uso do arquivo. O
boot do Next carrega a variável e migra corretamente; os comandos isolados tentam o
fallback `localhost:5432`. A correção fará parte da preparação do ambiente visual, sem
alterar o comportamento em produção.

## Direção de design aprovada

### 1. Fundação visual

`app/globals.css` continua como fonte única dos tokens. A mudança ajustará os tokens
semânticos existentes e só adicionará medidas compartilhadas quando elas eliminarem
duplicação real.

Alvos observados no benchmark desktop:

- sidebar global: 244 px;
- inset externo do conteúdo: 8 px;
- raio da superfície principal: 12 px;
- navegação primária: linhas de 28 px com raio de 8 px;
- location bar: 44 px;
- view bar: 43 px;
- linhas de issue: 44 px;
- cabeçalhos de grupo: 36 px, raio de 8 px;
- linhas da Inbox: 55 px; painel da lista com 284 px úteis no benchmark;
- tipografia de navegação: aproximadamente 13 px, peso 500;
- marca: manter `#5e6ad2`, aplicada somente pelos tokens semânticos;
- dark base: próxima de `#0e0f11`, com superfícies elevadas pouco contrastantes;
- bordas: usadas para estrutura, não para contornar todo componente.

O Circle continuará usando Inter como fonte principal. Pesos, line-height e tracking
serão calibrados por função: navegação, labels, corpo, títulos e números tabulares.

### 2. Chrome global

A sidebar existente será refinada sem mudar sua responsabilidade. O conteúdo principal
passará a obedecer a um único contrato de layout:

```text
App shell
├── Sidebar global (244 px)
└── Main surface (inset 8 px, radius 12 px)
    ├── Location bar (opcional por rota)
    ├── View bar / tabs (opcional por rota)
    ├── Toolbar contextual (opcional por rota)
    └── Page content
```

Os cabeçalhos duplicados serão consolidados por composição, mantendo os componentes de
ação específicos de cada domínio. A consolidação deve reduzir inconsistências sem criar
uma API genérica que tente modelar todas as páginas.

### 3. Superfícies de trabalho

Issues, projetos, iniciativas, reviews e teams compartilharão a mesma gramática:

- tabs compactas para views;
- filtros e display options alinhados à direita;
- grupos com fundo elevado suave e chevron previsível;
- linhas com alvo de clique integral, metadados alinhados e truncamento consistente;
- separadores apenas quando ajudam a leitura;
- skeletons com a mesma geometria do conteúdo final;
- empty state único por contexto, com ação somente quando existe próxima etapa útil.

List e board continuarão usando os stores e filtros atuais. A mudança é visual e de
composição, não de semântica.

### 4. Páginas de detalhe

Issue, project e initiative detail seguirão uma estrutura editorial:

- breadcrumb/identifier discreto no topo;
- título principal com largura confortável e ações secundárias silenciosas;
- conteúdo rico na coluna principal;
- propriedades em coluna lateral sem card pesado;
- activity/comments abaixo do conteúdo, com hierarquia tipográfica consistente;
- painel lateral colapsável nas larguras em que o conteúdo perderia legibilidade.

### 5. Inbox, Cycles e Settings

São superfícies especiais e não serão forçadas no molde das listas comuns.

**Inbox:** lista de notificações com largura fixa próxima de 300 px e painel de detalhe
flexível. Sem seleção, apenas o painel de detalhe mostra o estado vazio dominante.

**Cycles:** timeline densa; o ciclo atual pode expandir métricas e burn-up, enquanto
ciclos anteriores ficam resumidos. O gráfico existente será estilizado, não recalculado.

**Settings:** sidebar própria com retorno simples ao app e busca; conteúdo central com
largura de 640 px; seções agrupadas por cartões de raio 10 px. O header global de
Settings deixa de competir com o título da página.

### 6. Overlays e feedback

Dropdowns, popovers, dialogs, command menu e toasts usarão os mesmos tokens de surface,
border, shadow e focus ring. O comportamento continuará vindo de Radix/shadcn.

Feedback permanece verdadeiro: sucesso só depois da confirmação da API; falha preserva
rollback e mostra o erro. O redesign não altera essa regra.

## Estratégia de implementação

A execução será progressiva, em lotes pequenos e verificáveis:

1. **Reprodutibilidade local:** corrigir o carregamento de `.env.local` nos comandos de
   banco e preparar dados locais descartáveis para comparar estados preenchidos.
2. **Tokens e shell:** paleta, tipografia, radius, sidebar, main surface e estados base.
3. **Header system:** location bar, view bar, toolbar e tabs compartilhadas.
4. **Issues:** list, board, grupos, linhas, display options e filtros.
5. **Detalhes:** issue, project e initiative, incluindo propriedades e activity.
6. **Superfícies especiais:** inbox, cycles, projects, reviews e teams.
7. **Settings e overlays:** navegação, forms, cards, menus, dialogs e command menu.
8. **Hardening:** light/dark, responsividade, acessibilidade, loading/error/empty e
   regressão final.

Cada lote deve deixar a aplicação utilizável. Não haverá uma segunda árvore de
componentes ou uma migração "big bang".

## Responsividade

Os checkpoints de QA serão:

| Viewport    | Comportamento esperado                                     |
| ----------- | ---------------------------------------------------------- |
| 1728 × 1200 | referência principal para comparação lado a lado           |
| 1440 × 900  | desktop padrão, sem sobreposição de controles              |
| 1280 × 800  | sidebar e painéis preservam conteúdo prioritário           |
| 768 × 1024  | painéis secundários colapsam ou viram drawer               |
| 390 × 844   | navegação móvel existente, sem scroll horizontal acidental |

O benchmark define a intenção; a implementação respeita o conteúdo e as rotas próprias
do Circle quando o Linear não tiver equivalente direto.

## Acessibilidade

- foco visível em todos os elementos interativos;
- navegação completa por teclado em menus, dialogs, tabs e listas;
- contraste mínimo WCAG AA para texto e controles essenciais;
- áreas clicáveis de pelo menos 28 px no desktop e 40 px no touch;
- `aria-label` para ações representadas somente por ícone;
- animações respeitam `prefers-reduced-motion`;
- cor nunca é o único indicador de status ou prioridade.

## Validação

### Automática

Em cada lote:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm build` será obrigatório antes da entrega final. Testes novos cobrirão comportamento
alterado; mudanças puramente visuais não receberão testes artificiais que apenas fixem
classes CSS.

### Visual

Para cada rota afetada:

1. capturar Circle e Linear no mesmo viewport e tema;
2. comparar shell, alinhamentos, alturas, largura, tipografia e estados;
3. validar ao menos estado carregado, vazio, loading e menu/dialog aberto quando aplicável;
4. repetir em dark e light;
5. registrar no plano as divergências intencionais.

Tolerância de aceitação no desktop de referência:

- geometria do shell: até 2 px;
- alinhamentos internos e spacing repetido: até 4 px;
- nenhuma cor literal nova em componente;
- nenhum overflow, salto de layout ou controle truncado;
- nenhuma regressão funcional nos fluxos existentes.

Não será adicionada uma dependência de visual regression ao repositório nesta etapa. O
browser controlado permite comparação determinística sem aumentar a manutenção; essa
decisão pode ser revista se as regressões visuais se tornarem recorrentes.

## Riscos e contenções

| Risco                                         | Contenção                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Alterar tokens quebra muitas telas de uma vez | aplicar token por família, auditar todas as rotas antes do lote seguinte |
| Consolidar headers muda comportamento         | preservar handlers/stores e mover apenas composição/apresentação         |
| Fidelidade desktop piora mobile               | validar os cinco checkpoints em cada superfície estrutural               |
| Benchmark muda durante a execução             | fixar esta especificação e registrar qualquer mudança observada depois   |
| Dados locais insuficientes escondem estados   | usar banco descartável e dados de QA locais, nunca fixtures em produção  |
| Escopo vira implementação de features         | abrir issue separada para qualquer lacuna funcional encontrada           |

## Critérios de conclusão

- shell e navegação coerentes em todas as rotas autenticadas;
- listas, boards, detalhes, inbox, cycles e settings seguem a linguagem do Linear 2026;
- dark e light aprovados nos viewports definidos;
- overlays, loading, empty, error, hover, selected e focus revisados;
- nenhuma alteração de contrato de API ou schema;
- nenhum `CIRCLE_DEV_AUTH_EMAIL` rastreado;
- `typecheck`, `lint`, 100% dos testes e `build` verdes;
- documentação de continuidade atualizada com o que foi entregue e divergências
  intencionais restantes.
