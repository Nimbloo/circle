import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('app/globals.css');

function declaration(selector: string, name: string): string | undefined {
   const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const block = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1];
   return block?.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
}

const TOKENS = [
   '--priority-none',
   '--priority-urgent',
   '--priority-high',
   '--priority-medium',
   '--priority-low',
   '--health-no-update',
   '--health-on-track',
   '--health-at-risk',
   '--health-off-track',
   '--initiative-proposed',
   '--initiative-planned',
   '--initiative-active',
   '--initiative-canceled',
   '--success',
];

describe('tokens de paleta (prioridade, health, status de initiative)', () => {
   it.each(TOKENS)('%s existe no light e no dark e vira utilitário do Tailwind', (token) => {
      expect(declaration(':root', token)).toBeTruthy();
      expect(declaration('.dark', token)).toBeTruthy();
      expect(css).toContain(`--color-${token.slice(2)}: var(${token});`);
   });

   it('reproduz as cores atuais (no-priority unificado no tom do insights)', () => {
      expect(declaration(':root', '--priority-none')).toBe('#64748b');
      expect(declaration(':root', '--priority-urgent')).toBe('#eb5757');
      expect(declaration(':root', '--health-at-risk')).toBe('#f2c94c');
   });

   it.each([
      'components/common/issues/insights-panel.tsx',
      'components/common/my-issues/breakdown-panel.tsx',
      'components/common/initiatives/initiative-status-icon.tsx',
      'components/common/initiatives/initiatives.tsx',
      'components/common/settings/agent-personalization.tsx',
   ])('%s não tem cor hex literal de prioridade/health/status', (file) => {
      const src = read(file).replace(/const LABEL_COLORS[\s\S]*?\n\};/, '');
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
   });
});
