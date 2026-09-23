import { usePreferencesStore } from '@/store/preferences-store';

/** Dia da semana (0 = domingo … 6 = sábado), no formato do `Date#getDay` e do react-day-picker. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const BY_LABEL: Record<string, WeekDay> = { Sunday: 0, Monday: 1, Saturday: 6 };

/** Preferência "First day of the week" (Settings → Preferences) → dia; default segunda. */
export function weekStartFromPref(label: string | undefined): WeekDay {
   return BY_LABEL[label ?? ''] ?? 1;
}

/** Leitura pontual (handlers, cálculos fora de render). */
export function currentWeekStart(): WeekDay {
   return weekStartFromPref(usePreferencesStore.getState().firstDayOfWeek);
}

/** Versão reativa (calendários). */
export function useWeekStartsOn(): WeekDay {
   return weekStartFromPref(usePreferencesStore((s) => s.firstDayOfWeek));
}

/** Dias de `day` até o ÚLTIMO dia da semana corrente (0 se hoje já é o último). */
export function daysUntilWeekEnd(day: number, weekStart: WeekDay): number {
   return (((weekStart + 6 - day) % 7) + 7) % 7;
}

/** Dias de `day` até o 1º dia da PRÓXIMA semana (sempre 1..7). */
export function daysUntilNextWeekStart(day: number, weekStart: WeekDay): number {
   return (weekStart - day + 7) % 7 || 7;
}
