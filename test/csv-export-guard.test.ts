import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DE EXPORT CSV.
 *
 * Toda rota que devolve `text/csv` abre no Excel de alguém: precisa do BOM UTF-8 (senão
 * os acentos quebram) e de neutralizar células que começam com `= + - @` (senão o título
 * de uma issue vira fórmula executável — injeção de CSV). Ver `issues/export`.
 */
function routeFiles(): string[] {
   return execSync('git ls-files app/api', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('route.ts'));
}

describe('guarda de export CSV', () => {
   it('rota que serve text/csv tem BOM e neutraliza fórmula', () => {
      const csvRoutes = routeFiles().filter((f) => readFileSync(f, 'utf8').includes('text/csv'));
      expect(csvRoutes.length).toBeGreaterThan(0);
      const offenders = csvRoutes.filter((f) => {
         const src = readFileSync(f, 'utf8');
         return !src.includes("'\\uFEFF'") || !src.includes('[=+\\-@');
      });
      expect(offenders).toEqual([]);
   });
});
