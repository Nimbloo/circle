import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * O `migrate()` do boot NÃO pode usar o pool de `db/index.ts`: ele tem
 * `statement_timeout`/`query_timeout` de 15s e a primeira migration pesada seria
 * abortada no meio, derrubando o pod em CrashLoop. A conexão dedicada do advisory
 * lock (`lockClient`) não tem timeout e já vive por todo o migrate.
 */
describe('instrumentation — migrate no boot', () => {
   const src = readFileSync('instrumentation.ts', 'utf8');

   it('migra pela conexão dedicada do lock, não pelo pool', () => {
      expect(src).toMatch(/migrate\(drizzle\(lockClient\)/);
      expect(src).not.toMatch(/migrate\(getDb\(\)/);
   });

   it('o pool continua com timeout (o motivo de não migrar por ele)', () => {
      const dbSrc = readFileSync('db/index.ts', 'utf8');
      expect(dbSrc).toMatch(/statement_timeout/);
   });
});
