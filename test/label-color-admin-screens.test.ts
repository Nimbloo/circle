import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Cor de label passa por `labelColor` (token do tema para cor nomeada). Estas telas de
 * admin ainda pintavam com a cor crua: `'red'` não vira `var(--destructive)`.
 */
const FILES = [
   'components/common/members/member-profile.tsx',
   'components/common/settings/issue-labels-settings.tsx',
   'components/common/views/view-filter-editor.tsx',
];

describe('labels das telas de admin usam labelColor', () => {
   it.each(FILES)('%s não pinta label com a cor crua', (file) => {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/backgroundColor:\s*(label|l)\.color\b/);
      expect(src).toContain('labelColor(');
   });
});
