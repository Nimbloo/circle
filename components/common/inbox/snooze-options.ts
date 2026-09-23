import { currentWeekStart, daysUntilNextWeekStart } from '@/lib/week-start';

/**
 * Opções de adiamento (paridade Linear), com o instante calculado no clique: "Amanhã" é
 * amanhã às 9h no fuso local, e "Próxima semana" é o 1º dia da próxima semana às 9h. Antes eram
 * +24h e +168h, e "Amanhã" às 23h voltava às 23h do dia seguinte (co#13).
 */
export interface SnoozeOption {
   label: string;
   until: (now: Date) => Date;
}

const MORNING_HOUR = 9;

function atMorning(base: Date, addDays: number): Date {
   const d = new Date(base);
   d.setDate(d.getDate() + addDays);
   d.setHours(MORNING_HOUR, 0, 0, 0);
   return d;
}

export const SNOOZE_OPTIONS: readonly SnoozeOption[] = [
   { label: 'Em 1 hora', until: (now) => new Date(now.getTime() + 3600_000) },
   { label: 'Em 4 horas', until: (now) => new Date(now.getTime() + 4 * 3600_000) },
   { label: 'Amanhã', until: (now) => atMorning(now, 1) },
   {
      label: 'Próxima semana',
      // 1º dia da próxima semana conforme "First day of the week" (default segunda; se
      // hoje já é esse dia, o da semana que vem).
      until: (now) => atMorning(now, daysUntilNextWeekStart(now.getDay(), currentWeekStart())),
   },
];

export function snoozeUntilIso(option: SnoozeOption, now = new Date()): string {
   return option.until(now).toISOString();
}
