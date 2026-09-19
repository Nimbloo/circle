import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('app/globals.css');

/**
 * pl#12: a mesma métrica tinha cores diferentes (Started roxo num gráfico e amarelo no
 * outro; At risk roxo × amarelo). Progresso e health leem tokens únicos.
 */
describe('tokens de progresso e health (pl#12)', () => {
   it.each(['--progress-scope', '--progress-started', '--progress-completed'])(
      '%s é declarado e vira utilitário do Tailwind',
      (token) => {
         expect(css).toMatch(new RegExp(`${token}:\\s*[^;]+;`));
         expect(css).toContain(`--color-${token.slice(2)}: var(${token});`);
      }
   );

   it.each([
      'components/common/projects/details/project-progress-chart.tsx',
      'components/common/projects/details/project-properties-panel.tsx',
      'components/common/projects/project-snapshot-chart.tsx',
      'components/common/projects/health-popover.tsx',
      'components/common/initiatives/initiative-progress-panel.tsx',
      'components/common/initiatives/initiative-details.tsx',
      'components/common/projects/details/project-activity.tsx',
      'data/project-details.ts',
   ])('%s não usa hex, chart-N nem cor fixa para progresso/health', (file) => {
      const src = read(file);
      // `#102` e afins são referências de issue nos comentários, não cor.
      const hexes = (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((m) => !/^#\d{2,3}$/.test(m));
      expect(hexes).toEqual([]);
      expect(src.match(/chart-[0-9]/g) ?? []).toEqual([]);
      expect(src.match(/text-(green|red|amber)-500/g) ?? []).toEqual([]);
   });

   it('health.color do catálogo (hex do banco) não pinta a UI de planejamento', () => {
      for (const file of [
         'components/common/projects/projects-board.tsx',
         'components/common/projects/projects-timeline.tsx',
         'components/common/projects/project-context-menu.tsx',
         'components/common/roadmap/roadmap-timeline.tsx',
         'components/common/initiatives/initiative-project-row.tsx',
         'components/common/initiatives/initiatives.tsx',
      ]) {
         expect(read(file), file).not.toMatch(/health\.color/);
      }
   });
});
