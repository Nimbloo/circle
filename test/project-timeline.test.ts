import { describe, expect, it } from 'vitest';
import { projectDateRangeLabel } from '@/lib/project-dates';

describe('projectDateRangeLabel', () => {
   it('não tenta formatar um projeto sem data de início', () => {
      expect(projectDateRangeLabel('', undefined)).toBeNull();
   });

   it('ignora uma data-alvo inválida e preserva a data de início', () => {
      expect(projectDateRangeLabel('2026-09-01', 'invalid')).toBe('Sep 1');
   });

   it('formata o intervalo quando as duas datas são válidas', () => {
      expect(projectDateRangeLabel('2026-09-01', '2026-10-15')).toBe('Sep 1 - Oct 15');
   });
});
