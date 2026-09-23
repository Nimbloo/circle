import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Nome do documento: a UI (maxLength) e a API (z.max) têm que aceitar o mesmo tamanho
 * da coluna (varchar 196). Estavam em 196 e 128 — o usuário digitava 150 e recebia 400.
 */
describe('limite do nome do documento', () => {
   it('UI, rotas e coluna concordam em 196', () => {
      const ui = readFileSync('components/common/teams/team-document.tsx', 'utf8');
      const patch = readFileSync('app/api/v1/documents/[id]/route.ts', 'utf8');
      const create = readFileSync('app/api/v1/teams/[teamKey]/documents/route.ts', 'utf8');
      expect(ui).toContain('maxLength={196}');
      expect(patch.replace(/\s+/g, ' ')).toMatch(
         /name: z \.string\(\) \.trim\(\) \.min\(1[^)]*\) \.max\(196/
      );
      expect(
         (create.replace(/\s+/g, ' ').match(/\.max\(196/g) ?? []).length
      ).toBeGreaterThanOrEqual(2);
      expect(create.replace(/\s+/g, ' ')).not.toMatch(
         /name: z \.string\(\) \.trim\(\) \.min\(1[^)]*\) \.max\(128/
      );
   });
});
