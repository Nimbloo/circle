import { format, isValid, parseISO } from 'date-fns';

export function isValidProjectDate(value: string | undefined): value is string {
   return Boolean(value && isValid(parseISO(value)));
}

export function projectDateRangeLabel(
   startDate: string,
   targetDate: string | undefined
): string | null {
   if (!isValidProjectDate(startDate)) return null;

   const startLabel = format(parseISO(startDate), 'MMM d');
   if (!isValidProjectDate(targetDate) || targetDate === startDate) return startLabel;

   return `${startLabel} - ${format(parseISO(targetDate), 'MMM d')}`;
}

/**
 * Dia civil `YYYY-MM-DD` como data LOCAL (#44). `new Date('2026-09-30')` é meia-noite
 * UTC — em UTC−3 mostraria 29/09.
 */
export function parseDay(iso: string): Date {
   return parseISO(iso);
}

/** "Hoje" no fuso do usuário, em `YYYY-MM-DD` (não o dia UTC de `toISOString`). */
export function localTodayIso(now: Date = new Date()): string {
   return format(now, 'yyyy-MM-dd');
}
