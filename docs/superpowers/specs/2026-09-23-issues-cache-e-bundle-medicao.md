# Carregamento de issues e bundle — medição e decisão (2026-09-23)

Pedido do usuário: "medir e decidir com número". Nada aqui foi alterado em código; este
documento registra o que foi medido, o que isso diz e o gatilho para agir.

## 1. Bundle (build de produção com `ANALYZE=true`)

O `@next/bundle-analyzer` já existia (`next.config.ts`), ao contrário do que dizia o
`PENDENCIAS.md`. Resumo do `client.html` (gzip; script em `scratchpad`, não versionado):

| O quê                             | gzip                                                    | Leitura                                                                                                                        |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| First load das rotas mais pesadas | 452–470 kB (`/projects`, `/inbox`, `/issue/[id]`)       | Caiu desde a última medição (483–562 kB).                                                                                      |
| Compartilhado por todas as rotas  | 107 kB                                                  | Framework (next + react-dom).                                                                                                  |
| `@sentry/nextjs` + core + replay  | ~265 kB em 2 chunks **assíncronos**                     | Só baixa com DSN configurado; em prd não há DSN → custo zero hoje. Reavaliar quando o DSN entrar (nota já em `PENDENCIAS.md`). |
| `recharts` + `lodash`             | 96 kB em chunk assíncrono                               | Só nas telas com gráfico.                                                                                                      |
| `lucide-react`                    | 203 ícones, ~124 kB somando as cópias em chunks de rota | Por rota é bem menos; nenhum `import *` nem ícone dinâmico.                                                                    |
| Editor (tiptap + prosemirror)     | 76 kB                                                   | Chunk próprio, só onde há editor.                                                                                              |

**Decisão:** não há alvo gordo único no first load. O que sobra é código do próprio app
distribuído pelas rotas. Cortar mais seria refatoração sem ganho claro — não fazer agora.

## 2. Carregamento de todas as issues

Métrica real de produção (Prometheus, `http_request_duration_seconds`, job `circle-prd`),
`GET /api/v1/issues` (páginas keyset de 1.000, resposta comprimida):

| p50    | p95    |
| ------ | ------ |
| 217 ms | 430 ms |

**Ressalva:** o Prometheus local só guarda a série desde o pod atual (7 e 30 dias deram o
mesmo resultado) — amostra pequena, poucas cargas. Não há contagem de issues de prd nesta
medição (leitura do banco de prd bloqueada nesta sessão); a última referência era 2.000
issues = 2 requisições, 118 KB.

**Decisão:** a refatoração "store como cache + filtro no servidor + paginação por scroll"
**não se paga hoje** — a carga completa fica abaixo de meio segundo no p95, a primeira página
já aparece progressivamente (hydrate progressivo) e o volume é de ferramenta interna.

## 3. Gatilho para refazer o carregamento (plano, se o gatilho disparar)

Refazer quando QUALQUER um destes for verdade, medido em prd:

- p95 de `GET /api/v1/issues` acima de **1 s** por uma semana; ou
- um time passar de **10.000 issues** (≈10 páginas encadeadas, ~530 KB comprimidos); ou
- memória do heap do navegador reclamada por usuário em board/listas grandes.

Plano quando disparar, na ordem:

1. **Filtro no servidor por view**: a view ativa (time/estado/filtros de `?filters=`) vira
   query; o store guarda por `viewKey` (cache), não o workspace inteiro.
2. **Paginação por scroll** na lista virtualizada (keyset por rank, que já existe) e no board
   por coluna.
3. **Realtime**: `applyRemote` passa a atualizar só as views em cache que contêm a issue;
   eventos coarse invalidam por `viewKey`.
4. **Busca/contagens** (sidebar, seletor de status) passam a vir do servidor, porque o
   cliente deixa de ter o conjunto completo.

Riscos a tratar no desenho: seleção em lote e J/K atravessando páginas; drag-and-drop para
posição fora da página carregada; contagens por grupo sem ter todas as issues.
