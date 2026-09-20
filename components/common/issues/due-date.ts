import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';

/** Dias à frente em que o prazo já conta como "perto" (cor de aviso). */
const SOON_DAYS = 7;

/**
 * Prazo da issue (`YYYY-MM-DD`) como data LOCAL (is#7). `new Date('2026-03-20')` é meia-noite
 * UTC — no fuso −3 vira o dia anterior.
 */
export function parseDueDate(value: string): Date {
   return parseISO(value.slice(0, 10));
}

/** "Mar 20" no ano corrente; "Mar 20, 2027" fora dele. */
export function dueDateLabel(value: string, now: Date = new Date()): string {
   const d = parseDueDate(value);
   return format(d, d.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}

export type DueDateTone = 'overdue' | 'soon' | 'normal';

/** Vencida (antes de hoje), perto (hoje até +7 dias) ou normal. */
export function dueDateTone(value: string, now: Date = new Date()): DueDateTone {
   const d = parseDueDate(value);
   const today = startOfDay(now);
   if (d < today) return 'overdue';
   if (differenceInCalendarDays(d, today) < SOON_DAYS) return 'soon';
   return 'normal';
}

export const DUE_DATE_TONE_CLASS: Record<DueDateTone, string> = {
   overdue: 'text-destructive',
   soon: 'text-warning',
   normal: 'text-muted-foreground',
};
