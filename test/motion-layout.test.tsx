import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Acertos de layout e motion que vivem em classes (vi#7, vi#9, is#21). São verificações de
 * fonte: o efeito visual se mede no navegador, mas a regra não pode voltar sem aviso.
 */
describe('layout e motion das superfícies', () => {
   it('nenhum HeaderGroup adiciona padding ou margem à esquerda (vi#7)', () => {
      // O padding lateral do header é do `LocationBar` (px-2) e só dele: o `pl` extra de
      // algumas telas movia o título 10 px entre telas irmãs.
      const files = execSync('git ls-files components/layout/headers', { encoding: 'utf8' })
         .split('\n')
         .filter((file) => file.endsWith('.tsx'));
      const offenders = files.filter((file) =>
         [...readFileSync(file, 'utf8').matchAll(/<HeaderGroup[^>]*className="([^"]*)"/g)].some(
            (match) => /\b(pl|ml|px|mx)-/.test(match[1])
         )
      );
      expect(offenders).toEqual([]);
   });

   it('sub-item da sidebar em 13px, como o resto do corpo (vi#9)', () => {
      const src = readFileSync('components/ui/sidebar.tsx', 'utf8');
      const sub = src.slice(src.indexOf('function SidebarMenuSubButton'));
      expect(sub.slice(0, sub.indexOf('export'))).not.toContain("'text-sm'");
   });

   it('a barra de ações em lote entra com fade e translateY (is#21)', () => {
      const src = readFileSync('components/common/issues/bulk-actions-bar.tsx', 'utf8');
      expect(src).toContain('motion-rise');
   });
});
