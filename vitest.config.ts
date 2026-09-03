import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

// Cada arquivo de teste sobe um Postgres em WASM (PGlite) e roda as migrations: um
// worker custa CPU e memória de verdade, e o pool de forks satura a máquina quando
// abre um fork por core (teardown flaky, ERR_IPC_CHANNEL_CLOSED, timeouts em cascata).
// Metade dos cores (mínimo 2) mantém a suíte paralela sem disputar recurso; o CLI
// (`--maxWorkers=N`) ainda sobrepõe quando a máquina está carregada.
const workers = Math.max(2, Math.floor(availableParallelism() / 2));

export default defineConfig({
   esbuild: {
      jsx: 'automatic',
   },
   test: {
      environment: 'node',
      include: ['test/**/*.test.{ts,tsx}'],
      // 60 s: o boot do WASM + migrations do PGlite no Windows fica bem acima dos 5 s
      // default e, com a suíte inteira em paralelo, estourava os 20 s anteriores em
      // máquina carregada — falha por lentidão da máquina, não por bug.
      testTimeout: 60000,
      hookTimeout: 60000,
      maxWorkers: workers,
      minWorkers: Math.min(2, workers),
      // Pool de forks: o pool de threads (default) sofre teardown flaky no Windows/CI
      // (ERR_IPC_CHANNEL_CLOSED) mesmo com todos os testes verdes, quebrando o exit code.
      // Forks são isolados por processo e encerram limpo.
      pool: 'forks',
      // Inline do drizzle-orm: desde que `@opentelemetry/api` entrou na árvore (peer do
      // drizzle satisfeito pelo prom-client), o Node dispara "Cannot require() ES Module
      // ... in a cycle" ao carregar o drizzle via require(esm). Inline força o vitest a
      // transformar o pacote (ESM), evitando o ciclo. Não afeta build/prod (Next já é ESM).
      server: {
         deps: {
            inline: [/drizzle-orm/],
         },
      },
   },
   resolve: {
      alias: {
         '@': fileURLToPath(new URL('./', import.meta.url)),
      },
   },
});
