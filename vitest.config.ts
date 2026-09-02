import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
   esbuild: {
      jsx: 'automatic',
   },
   test: {
      environment: 'node',
      include: ['test/**/*.test.{ts,tsx}'],
      testTimeout: 20000,
      hookTimeout: 20000,
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
