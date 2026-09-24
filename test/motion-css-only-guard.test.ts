import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * O motion do Circle é CSS (tokens + classes em app/globals.css). A lib `motion`
 * (framer-motion) foi removida: pagava ~37 kB de First Load nas rotas de issues para uma
 * dica de drop e um layoutId que não animava na lista virtualizada. Não volta sem medir.
 */
describe('motion só por CSS', () => {
   it('nenhum arquivo importa motion/framer-motion e a dependência não existe', () => {
      const files = execSync('git ls-files app components lib hooks store', { encoding: 'utf8' })
         .split('\n')
         .filter((file) => /\.(ts|tsx)$/.test(file));
      const offenders = files.filter((file) =>
         /from ['"](motion(\/[\w-]+)?|framer-motion)['"]/.test(readFileSync(file, 'utf8'))
      );
      expect(offenders).toEqual([]);
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      expect(pkg.dependencies.motion).toBeUndefined();
      expect(pkg.dependencies['framer-motion']).toBeUndefined();
   });

   it('o editor inline de initiative abre pelo Collapsible (altura em CSS, reduced-motion)', () => {
      const src = readFileSync('components/common/initiatives/initiatives.tsx', 'utf8');
      expect(src).toMatch(/<Collapsible open=\{creating\}>/);
   });

   it('as classes da lista viva desligam em prefers-reduced-motion', () => {
      const css = readFileSync('app/globals.css', 'utf8');
      const reduced = [
         ...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
      ]
         .map((m) => m[1])
         .join('\n');
      for (const cls of ['.list-enter', '.list-grow', '.list-move']) {
         expect(reduced).toContain(cls);
      }
   });

   it('listas vivas usam o useListMotion (virtual, coluna do board, inbox)', () => {
      for (const file of [
         'components/common/issues/virtual-issue-list.tsx',
         'components/common/issues/group-issues.tsx',
         'components/common/inbox/inbox.tsx',
      ]) {
         expect(readFileSync(file, 'utf8')).toContain('useListMotion(');
      }
   });

   it('a coluna do board passa a posição pelo MoveGate e a lista virtual desenha a saída', () => {
      expect(readFileSync('components/common/issues/group-issues.tsx', 'utf8')).toContain(
         'moveGate.allow('
      );
      expect(readFileSync('components/common/issues/virtual-issue-list.tsx', 'utf8')).toContain(
         'list-exit list-exit-virtual'
      );
   });
});
