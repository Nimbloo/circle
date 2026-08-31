import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DE REATIVIDADE DO STORE.
 *
 * Assinar um GETTER do zustand (`useXStore((s) => s.getFoo)`) e chamá-lo fora do
 * seletor não re-renderiza: a referência da função é estável, então o componente
 * nunca acorda quando o dado muda. Foi o bug do detalhe de initiative — salvava e
 * a tela seguia mostrando o valor antigo, e no vínculo de projeto isso chegou a
 * DESVINCULAR o projeto anterior em silêncio (o payload era montado sobre estado
 * velho e o PATCH substitui o conjunto inteiro).
 *
 * As duas formas corretas:
 *  - getter que devolve referência ESTÁVEL (`find`) → chamar DENTRO do seletor:
 *    `useWorkspaceStore((s) => s.getCycleById(id))`;
 *  - getter que devolve ARRAY NOVO (`filter`/`map`) → NÃO pode ir no seletor
 *    (referência nova a cada leitura = re-render infinito): assinar a fatia crua
 *    (`s.cycles`, `s.projects`) e derivar no componente.
 *
 * Ações (`hydrate`, `apply*`, `remove*`) seguem livres: são chamadas em handler,
 * não durante o render, e não precisam disparar re-render.
 */
const ANTI_PATTERN = /use[A-Za-z]+Store\(\s*\(\s*s\s*\)\s*=>\s*s\.(get[A-Za-z]+)\s*\)/g;

function sourceFiles(): string[] {
   return execSync('git ls-files components app lib store', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

describe('guarda de reatividade dos seletores de store', () => {
   it('nenhum componente assina um getter do store sem chamá-lo no seletor', () => {
      const offenders: string[] = [];

      for (const file of sourceFiles()) {
         const src = readFileSync(file, 'utf8');
         for (const m of src.matchAll(ANTI_PATTERN)) {
            const line = src.slice(0, m.index).split('\n').length;
            offenders.push(`${file}:${line} — ${m[1]}`);
         }
      }

      expect(offenders).toEqual([]);
   });
});
