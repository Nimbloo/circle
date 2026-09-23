import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Espera fixa longa em teste (`await new Promise((r) => setTimeout(r, 500))`) é lenta e
 * frágil: estoura com a máquina carregada. Positivo = esperar a condição (`waitFor`);
 * negativo ("não refez o fetch depois do debounce") = timer falso com
 * `vi.useFakeTimers({ shouldAdvanceTime: true })` + `vi.advanceTimersByTimeAsync(ms)`.
 * Ficam abaixo do teto só voltas curtas de event loop, latência simulada dentro de um
 * fetch falso e o intervalo de um polling com limite.
 */
const MAX_SLEEP_MS = 30;

describe('testes sem espera fixa longa', () => {
   it(`nenhum setTimeout de espera em teste passa de ${MAX_SLEEP_MS} ms`, () => {
      const files = execSync('git ls-files test', { encoding: 'utf8' })
         .split('\n')
         .filter((f) => /\.test\.tsx?$/.test(f) && !f.endsWith('no-fixed-sleep-guard.test.ts'));
      const offenders: string[] = [];
      for (const file of files) {
         for (const m of readFileSync(file, 'utf8').matchAll(
            /new Promise\(\s*\(?r\)?\s*=>\s*setTimeout\(r,\s*(\d+)\)\s*\)/g
         )) {
            if (Number(m[1]) > MAX_SLEEP_MS) offenders.push(`${file}: ${m[1]} ms`);
         }
      }
      expect(offenders).toEqual([]);
   });
});
