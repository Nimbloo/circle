import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DE CORRELAÇÃO DO `handle()`.
 *
 * `handle(fn, req)` usa o `req` para duas coisas: carimbar o log de erro com
 * método/rota (`reqTag`) e registrar a métrica HTTP com o método real
 * (`observeHttp`). Sem ele, o erro sai sem rota e a métrica vai como
 * `method: UNKNOWN` — foi o estado de 113 das 130 chamadas.
 *
 * Todo handler já recebe `req` (o guarda de auth garante isso), então passar
 * adiante é sempre possível.
 */
const HANDLE_CALL = /return handle\(/g;
const WITH_REQ = /\}, req\);/g;

function routeFiles(): string[] {
   return execSync('git ls-files app/api', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('route.ts'));
}

describe('guarda de correlação do handle()', () => {
   it('toda chamada a handle() passa o req adiante', () => {
      const offenders: string[] = [];

      for (const file of routeFiles()) {
         const src = readFileSync(file, 'utf8');
         const calls = [...src.matchAll(HANDLE_CALL)].length;
         if (calls === 0) continue;
         const withReq = [...src.matchAll(WITH_REQ)].length;
         if (withReq < calls) offenders.push(`${file} — ${calls} chamada(s), ${withReq} com req`);
      }

      expect(offenders).toEqual([]);
   });
});
