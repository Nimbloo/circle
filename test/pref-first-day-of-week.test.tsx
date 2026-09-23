// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Calendar } from '@/components/ui/calendar';
import { SNOOZE_OPTIONS } from '@/components/common/inbox/snooze-options';
import { usePreferencesStore } from '@/store/preferences-store';
import { daysUntilNextWeekStart, daysUntilWeekEnd } from '@/lib/week-start';

const firstHeader = () =>
   (screen.getAllByRole('columnheader')[0].getAttribute('aria-label') ?? '').toLowerCase();

describe('preferência "First day of the week"', () => {
   it('o calendário começa no dia escolhido', () => {
      for (const [pref, day] of [
         ['Monday', 'monday'],
         ['Sunday', 'sunday'],
         ['Saturday', 'saturday'],
      ] as const) {
         usePreferencesStore.getState().setPref('firstDayOfWeek', pref);
         const { unmount } = render(<Calendar mode="single" month={new Date(2026, 8, 1)} />);
         expect(firstHeader()).toBe(day);
         unmount();
      }
   });

   it('fim da semana e início da próxima seguem o 1º dia', () => {
      // Quarta-feira (3).
      expect(daysUntilWeekEnd(3, 1)).toBe(4); // domingo
      expect(daysUntilWeekEnd(3, 0)).toBe(3); // sábado
      expect(daysUntilWeekEnd(3, 6)).toBe(2); // sexta
      expect(daysUntilWeekEnd(0, 1)).toBe(0); // domingo já é o fim
      expect(daysUntilNextWeekStart(3, 1)).toBe(5); // segunda
      expect(daysUntilNextWeekStart(3, 0)).toBe(4); // domingo
      expect(daysUntilNextWeekStart(1, 1)).toBe(7); // segunda → a da semana que vem
   });

   it('snooze "Próxima semana" cai no 1º dia da próxima semana', () => {
      const wednesday = new Date(2026, 8, 23, 10, 0, 0);
      const nextWeek = SNOOZE_OPTIONS.find((o) => o.label === 'Próxima semana')!;
      usePreferencesStore.getState().setPref('firstDayOfWeek', 'Sunday');
      expect(nextWeek.until(wednesday).getDay()).toBe(0);
      usePreferencesStore.getState().setPref('firstDayOfWeek', 'Monday');
      expect(nextWeek.until(wednesday).getDay()).toBe(1);
   });
});
