# Paridade de interação com o Linear

**Data:** 2026-09-01

**Status:** aprovado

## Objetivo

Corrigir as lacunas funcionais observadas depois da entrega visual v0.21.0 e reproduzir
o comportamento atual do Linear nas superfícies de Inbox e Initiatives, nos filtros e
nos botões de opções. A referência é o workspace Nimbloo autenticado em
`linear.app/nimbloo`, medido no mesmo Chrome usado para validar o Circle.

Esta especificação complementa a paridade visual já concluída. Quando houver conflito,
ela prevalece somente sobre os controles e fluxos descritos abaixo. O usuário autorizou
explicitamente a extensão aditiva do contrato de initiatives para labels e metadados do
ícone.

## Evidência do benchmark

### Criação de initiative

O Linear insere um card no topo da lista, dentro de uma linha animada de 136 px. O card
mede 112 px, tem raio de 6 px, borda e sombra sutis e padding interno de 12/17/16 px.
A entrada e a saída combinam altura e opacidade em aproximadamente 200 ms. O nome recebe
foco imediatamente.

A ordem de foco observada é: nome, resumo, status, prioridade, responsável, período,
labels, Cancel e Create. Os seletores abrem command menus pesquisáveis; setas navegam,
Enter seleciona e Escape fecha a camada atual devolvendo o foco ao gatilho. Status e
prioridade exibem atalhos numéricos. O período usa um picker próprio para dia, mês,
quarter, semestre e ano. O seletor de ícone oferece ícones, emojis e cor.

### Detalhes da initiative

O header contém um botão de 28 × 28 px cujo nome acessível alterna entre
`Open Initiative details` e `Close Initiative details`. O painel lateral mede 400 px,
some sem deixar coluna vazia, preserva o foco no botão e mantém o estado após reload.
O painel agrupa Properties e Activity e permite editar status, prioridade, responsável,
período e labels.

### Inbox

A lista inicia em 300 px. O divisor visível tem 1 px e uma hit area de 7 px com cursor
de resize. A lista não encolhe abaixo de 300 px, pode crescer até 50% da área de trabalho
e a largura escolhida é persistida. O comportamento mobile atual permanece uma troca
lista/detalhe, sem splitter.

### Sidebar, filtros e menus

No dark theme do Linear, o hover da navegação usa `lch(8.445 1.3 272)` e o item
selecionado usa `lch(13.845 1.3 272)`. No Circle os dois estados apontam hoje para o
mesmo token.

Filtros hierárquicos usam busca e navegação em camadas: ArrowDown/ArrowUp percorrem,
Enter ou ArrowRight avançam, ArrowLeft ou Escape retornam à camada anterior e somente o
Escape na raiz fecha o popover e devolve foco ao gatilho. Menus Radix já entregam essa
semântica; os filtros customizados baseados em Popover + Command precisam adotá-la.

Os botões de opções do Linear são controles reais de 28 × 28 px, com ícone Lucide de
16 px, nome acessível, hover distinto do estado aberto, foco visível e menu pesquisável
quando a lista é extensa. Ícones decorativos que parecem botões não são aceitáveis.

## Design aprovado

### 1. Primitive de navegação em camadas

Criar um hook pequeno e reutilizável para os command menus hierárquicos. Ele mantém uma
pilha de painéis, expõe `push`, `back` e `reset` e trata ArrowLeft/Escape sem duplicar a
lógica em cada filtro. O foco do campo de busca é restaurado ao mudar de camada.

O filtro genérico e o filtro de initiatives passam a usar a primitive. Os componentes
Radix DropdownMenu e ContextMenu não serão reimplementados.

### 2. Contrato aditivo de initiatives

Adicionar:

- `initiative_label(initiative_id, label_id)` com chave primária composta;
- `icon_color` nullable em `initiative`;
- `labelIds?: string[]` e `iconColor?: string | null` nos inputs;
- `labels` e `iconColor` no DTO.

O campo `icon` atual continua sendo a fonte do glyph e passa a aceitar uma chave de
ícone ou um emoji; seu tamanho será ampliado sem descartar dados. Consumidores antigos
continuam válidos porque todos os campos de entrada novos são opcionais e os campos de
saída são aditivos.

### 3. New initiative

O formulário será preservado como criação inline, mas renderizado dentro de
`AnimatePresence` e `motion.div`. Inputs de nome e resumo terão aparência editorial.
Os chips atuais serão substituídos por triggers acessíveis e command menus consistentes.
O picker de período será compartilhado com o detalhe. Labels usam o catálogo já
carregado pelo workspace. Create permanece desabilitado sem nome ou durante request;
toast de sucesso somente após resposta e rollback honesto em erro.

### 4. Details panel

Criar store persistido específico de initiative detail para não compartilhar estado com
painéis de project/issue. O header controla o painel desktop. A versão mobile permanece
Sheet. O conteúdo do aside continua com 400 px e recebe labels e os mesmos controles de
propriedade do formulário de criação.

### 5. Inbox splitter

Usar a primitive existente de `react-resizable-panels`. O handle ganhará hit area de
7 px, teclado e estado visual hover/drag. O layout desktop persiste a largura; abaixo do
breakpoint mobile o componente atual permanece inalterado.

### 6. Estados e botões de opções

Adicionar `--sidebar-hover` em todos os temas e migrar apenas os estados hover da
sidebar. Selected/open continuam usando `--sidebar-accent`.

Auditar todos os `MoreHorizontal`/`Ellipsis` visíveis. Cada ocorrência deverá ser um
Button com `aria-label` e menu funcional já suportado pelo domínio, ou ser removida se
for apenas decoração. Não serão inventadas ações sem regra de negócio correspondente.

## Testes e aceitação

- testes de serviço PGlite para labels e metadados de ícone;
- testes de interação para teclado, foco, cancelamento, resize e persistência;
- testes semânticos impedindo icon buttons sem nome e glyphs decorativos de opção;
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` e `git diff --check` verdes;
- nenhum `CIRCLE_DEV_AUTH_EMAIL` rastreado;
- comparação visual em dark/light nos viewports 1728 × 1200, 1440 × 900,
  768 × 1024 e 390 × 844;
- tolerância de 2 px na geometria estrutural e 4 px no spacing interno repetido.
