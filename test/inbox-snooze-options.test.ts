import { describe, expect, it } from 'vitest';
import { SNOOZE_OPTIONS } from '@/components/common/inbox/snooze-options';

/** co#13 — "Amanhã" era +24h (23h de hoje → 23h de amanhã); agora amanhã às 9h. */
const byLabel = (label: string) => SNOOZE_OPTIONS.find((o) => o.label === label)!;

describe('opções de adiamento', () => {
   it('Amanhã = dia seguinte às 9h (hora local)', () => {
      const now = new Date(2026, 8, 18, 23, 30); // sexta, 23h30
      const until = byLabel('Amanhã').until(now);
      expect([until.getDate(), until.getHours(), until.getMinutes()]).toEqual([19, 9, 0]);
   });

   it('Próxima semana = próxima segunda às 9h', () => {
      const friday = new Date(2026, 8, 18, 10, 0);
      const monday = new Date(2026, 8, 21, 10, 0);
      const fromFriday = byLabel('Próxima semana').until(friday);
      const fromMonday = byLabel('Próxima semana').until(monday);
      expect([fromFriday.getDay(), fromFriday.getDate(), fromFriday.getHours()]).toEqual([
         1, 21, 9,
      ]);
      expect([fromMonday.getDay(), fromMonday.getDate()]).toEqual([1, 28]);
   });

   it('Em 1 hora continua relativo', () => {
      const now = new Date(2026, 8, 18, 10, 15);
      expect(byLabel('Em 1 hora').until(now).getTime() - now.getTime()).toBe(3600_000);
   });
});
