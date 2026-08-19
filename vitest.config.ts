import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
   test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
      testTimeout: 20000,
      hookTimeout: 20000,
   },
   resolve: {
      alias: {
         '@': fileURLToPath(new URL('./', import.meta.url)),
      },
   },
});
