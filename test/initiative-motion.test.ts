import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('movimento do editor de initiative', () => {
   it('respeita a preferência de movimento reduzido', () => {
      const source = readFileSync(
         join(process.cwd(), 'components/common/initiatives/initiatives.tsx'),
         'utf8'
      );

      expect(source).toContain('useReducedMotion');
      expect(source).toContain('duration: prefersReducedMotion ? 0 : 0.2');
   });
});
