# Transições, loading e estados vazios — Circle

## Objetivo

Padronizar a percepção de navegação e ausência de dados no Circle sem introduzir uma
camada visual pesada, sem mascarar erros e sem degradar a sincronização em tempo real.

O resultado deve seguir os padrões nativos do Next App Router: `loading.tsx`/Suspense
para feedback imediato de navegação, layouts persistentes para preservar estado e
estados vazios contextuais com título, explicação curta e ação opcional.

Referências usadas na validação:

- Next recomenda `loading.tsx` para estados instantâneos, streaming e navegação
  interruptível: https://nextjs.org/docs/app/getting-started/linking-and-navigating
- Next recomenda skeletons/spinners significativos em vez de uma tela genérica de
  espera: https://nextjs.org/docs/app/getting-started/fetching-data
- React recomenda feedback de transição sem bloquear a interação:
  https://react.dev/reference/react/useTransition
- `role="status"` fornece anúncio polido para conteúdo dinâmico e estados de espera:
  https://www.w3.org/TR/aria-role/roles.html
- Animações devem respeitar `prefers-reduced-motion`:
  https://web.dev/learn/accessibility/motion

## Diagnóstico confirmado

### Navegação e performance

- `app/[orgId]/layout.tsx` é persistente e contém `DataHydrator`, `useLiveSync`,
  sidebar e atalhos globais.
- Remontar esse layout durante uma troca de rota faria o bootstrap e o SSE serem
  recriados; isso é proibido.
- O projeto já possui `motion` como dependência, mas a mudança não precisa adicionar
  animação JS: CSS e as convenções do App Router cobrem o caso com menor custo.
- Já existe `ListSkeleton`, que deve continuar sendo usado nos carregamentos internos
  de listas. O novo loading de rota não deve substituir skeletons específicos quando
  a tela já conhece o formato futuro.

### Realtime

O caminho atual foi auditado e permanece fora do escopo de refatoração visual:

- o cliente abre um único SSE por layout persistente;
- o servidor autentica o stream, envia heartbeat de 25s e revalida a conta;
- abas ocultas liberam a conexão após 60s e re-hidratam ao voltar;
- a reconexão tem backoff com jitter e teto de 30s;
- eventos entre pods usam `pg_notify` e deduplicação por instância;
- issues, projetos e iniciativas usam atualização targeted;
- catálogo, times, membros, views, documentos, ciclos e notificações usam hidratação
  debounced;
- comentários atualizam apenas o detalhe/feed da issue;
- reviews atualizam lista e detalhe por evento de janela;
- testes existentes cobrem as famílias críticas de publicação.

Regra da implementação: loading de navegação e estado vazio não podem fechar SSE,
limpar stores, re-hidratar por conta própria ou trocar conteúdo válido por spinner.

### Estados vazios

Há estados locais heterogêneos. A padronização deve atingir apenas vazios de conteúdo
de página e seção, não `CommandEmpty` de comboboxes, mensagens de validação, gráficos
sem histórico ou placeholders de formulário.

## Design aprovado

### 1. Primitivo `CircleLoading`

Criar `components/common/circle-loading.tsx`, server-compatible e sem dependência de
estado. API pequena:

```ts
type CircleLoadingProps = {
   label?: string;
   size?: 'sm' | 'md' | 'lg';
   className?: string;
};
```

Visual:

- reutiliza `CircleLogo`, mantendo o símbolo da marca;
- animação discreta de escala/opacidade, sem rotação chamativa ou efeito ornamental;
- texto visível opcional, em português, para estados de página;
- `role="status"` e `aria-live="polite"`;
- `aria-hidden` apenas no SVG, não no container que comunica o estado;
- `prefers-reduced-motion` desliga a animação, mantendo o ícone estático;
- não usa `backdrop-filter`, canvas, imagem adicional ou biblioteca de animação.

### 2. Loading de rota

Criar `app/loading.tsx` para rotas públicas e `app/[orgId]/loading.tsx` para o
workspace, ambos usando o mesmo `CircleLoading`/layout visual.

Para o workspace, o fallback deve ocupar apenas a área de conteúdo e deixar o layout
pai disponível. Não será criado um `app/template.tsx` global, pois isso poderia
remontar `[orgId]/layout` e interromper stores, sidebar e SSE.

Adicionar uma entrada de animação de entrada CSS curta ao conteúdo de rota, aplicada
somente no segmento `[orgId]` por `app/[orgId]/template.tsx` ou equivalente seguro:

- fade de 0 para 1;
- deslocamento vertical máximo de 4px;
- duração entre 160ms e 200ms;
- easing padrão do sistema;
- sem animação de saída, para não atrasar navegação;
- desabilitada em `prefers-reduced-motion`.

Se a validação do App Router mostrar que o template ameaça remontar algum estado
persistente, a transição será reduzida ao fallback `loading.tsx`, sem insistir numa
abstração global.

### 3. Primitivo `EmptyState`

Criar `components/common/empty-state.tsx` com uma composição Linear-like, contida e
reutilizável:

```ts
type EmptyStateVariant = 'empty' | 'activity' | 'search' | 'filtered';

type EmptyStateProps = {
   variant?: EmptyStateVariant;
   title: string;
   description?: string;
   action?: React.ReactNode;
   className?: string;
};
```

Visual:

- área central da seção, sem ilustração grande;
- ícone Lucide dentro de um container pequeno com borda e fundo de card;
- título curto e específico;
- descrição opcional orientando o próximo passo;
- ação primária opcional, apenas quando houver ação útil;
- tokens existentes de cor, borda, radius e sombra;
- largura máxima limitada para não formar bloco visual desproporcional;
- `role="status"` somente para o estado de conteúdo; dropdowns continuam com seu
  `CommandEmpty` compacto.

Variantes servem apenas para semântica e ícone padrão; não criam quatro layouts
diferentes. Um consumidor pode fornecer `action` e sobrescrever `className` quando a
seção exigir altura ou alinhamento específico.

### 4. Aplicação nos consumidores

Substituir estados textuais ou desenhos isolados de página nos módulos principais:

- inbox;
- issues e my issues;
- projetos e detalhes de projeto;
- iniciativas;
- reviews;
- roadmap;
- times, membros e documentos;
- atividades e configurações que exibem listas vazias.

Não substituir automaticamente:

- `CommandEmpty` de selects e filtros;
- empty de gráfico que explica falta de histórico;
- skeletons durante a primeira carga;
- mensagens de erro;
- telas em que vazio significa uma regra de negócio específica e já há ação própria.

Cada consumidor deve separar explicitamente:

1. erro → `ErrorState`;
2. primeira carga → skeleton ou `CircleLoading`;
3. conteúdo vazio após carga → `EmptyState`;
4. refetch em background com conteúdo → manter conteúdo e, no máximo, indicador
   discreto local.

### 5. Realtime e concorrência

Não adicionar polling para suportar os estados vazios. O estado vazio é derivado do
store atual e muda automaticamente quando o SSE aplica um evento.

Quando um evento criar o primeiro item, a tela sai do vazio pelo store; quando remover
o último, entra no vazio após a mutação confirmada. O fluxo otimista existente deve
continuar responsável pela resposta imediata do próprio usuário, com rollback em caso
de falha.

`DataHydrator` e `useLiveSync` continuam exclusivamente em `[orgId]/layout.tsx`.
Nenhum `loading.tsx`, template ou `EmptyState` fará chamada de API, subscription,
`router.refresh` ou reset de store.

## Testes e verificação

Antes da implementação, escrever testes que falhem para:

- `CircleLoading` expor o status acessível e os tamanhos previstos;
- `EmptyState` renderizar título, descrição e ação sem gerar markup excessivo;
- variantes escolherem ícones/labels consistentes;
- consumidores não exibirem vazio enquanto a primeira carga está pendente;
- o realtime continuar coberto pelos testes existentes de eventos.

Depois:

- `pnpm test`;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm build`;
- inspeção visual em light/dark, viewport móvel e desktop;
- verificação de `prefers-reduced-motion`;
- validação de que o SSE permanece uma conexão por workspace e que navegação não
  aumenta hidratações.

## Fora de escopo

- trocar a arquitetura de realtime;
- adicionar React Query/SWR ou polling;
- instalar biblioteca visual nova;
- reescrever todos os componentes de lista;
- alterar contratos de API ou banco;
- criar ilustrações ou motion design chamativo;
- afirmar realtime para preferências locais sem mudança de produto: essas preferências
  continuam sincronizadas por `user-settings-sync` e não são eventos de domínio.
