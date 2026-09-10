import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * GUARDA DO CARREGAMENTO SOB DEMANDA DO SENTRY.
 *
 * `instrumentation-client.ts` roda em TODA página. Um `import` estático de
 * `@sentry/nextjs` ali coloca o SDK no bundle inicial de todas as rotas — mesmo
 * hoje, com o SDK inerte por não haver DSN configurado.
 *
 * Medido com `ANALYZE=true pnpm build`, trocando só a forma do import:
 *
 *   chunks iniciais comuns a todas as páginas   598 kB -> 360 kB   (-40%)
 *   shell (`/[orgId]/layout`)                  1510 kB -> 1277 kB
 *   `/[orgId]/inbox`                           1666 kB -> 1433 kB
 *
 * Como o DSN é embutido em tempo de build, um build sem DSN torna
 * `if (SENTRY_DSN)` falso estaticamente e o bundler elimina o ramo inteiro. Voltar
 * ao import estático desfaz isso **em silêncio**: nada quebra, a página só volta a
 * ficar ~238 kB mais pesada para todo usuário. Daí a verificação ser na forma do
 * import — medir bytes exigiria build completo.
 *
 * ── A CONTRAPARTIDA, para quem for configurar o DSN ──────────────────────────
 *
 * Com `import()` dinâmico o webpack não consegue mais eliminar o que não é usado
 * dentro do SDK: o chunk assíncrono ficou em ~928 kB (o `@sentry/replay` volta ao
 * grafo com ~226 kB mesmo sem a integração ser registrada). Hoje isso não custa
 * nada, porque sem DSN o chunk NUNCA é baixado. Com DSN, passa a ser baixado —
 * fora do caminho crítico, mas maior que os ~293 kB do import estático já
 * tree-shaken. Os flags `treeshake.excludeReplay*` foram testados e devolveram só
 * ~10 kB; não compensam.
 *
 * Ou seja: **ao configurar o DSN, meça de novo.** O import estático pode passar a
 * ser a escolha certa, e aí mudar este teste é a forma deliberada de fazer isso —
 * é exatamente o que ele existe para provocar.
 */
const ARQUIVO = 'instrumentation-client.ts';

/** `import ... from '@sentry/...'` que NÃO seja `import type` (esse é apagado). */
const IMPORT_ESTATICO = /^\s*import\s+(?!type\s)[^;]*?from\s+['"]@sentry\/[^'"]+['"]/m;
const IMPORT_DINAMICO = /import\(\s*['"]@sentry\/nextjs['"]\s*\)/;
const GUARDA_DSN = /if\s*\(\s*SENTRY_DSN\s*\)/;

describe('guarda do carregamento sob demanda do Sentry', () => {
   const src = readFileSync(ARQUIVO, 'utf8');

   it('não importa o SDK de forma estática', () => {
      const encontrado = src.match(IMPORT_ESTATICO)?.[0]?.trim();
      expect(encontrado, `import estático de @sentry em ${ARQUIVO}`).toBeUndefined();
   });

   it('importa sob demanda, e só quando há DSN', () => {
      expect(IMPORT_DINAMICO.test(src), 'falta o import() dinâmico de @sentry/nextjs').toBe(true);
      expect(GUARDA_DSN.test(src), 'o import precisa estar dentro de if (SENTRY_DSN)').toBe(true);
   });

   it('continua exportando onRouterTransitionStart, que o Next exige', () => {
      expect(/export\s+const\s+onRouterTransitionStart/.test(src)).toBe(true);
   });
});
