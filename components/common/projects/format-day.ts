import { format, isValid, parseISO } from 'date-fns';

/**
 * Dia de planejamento no formato do Linear: "Mar 20", com o ano só quando não é o ano
 * corrente ("Mar 20, 2027"). A entrada `YYYY-MM-DD` passa sempre por `parseISO` (dia
 * civil local; `new Date(iso)` seria meia-noite UTC e mostraria o dia anterior em UTC−3).
 */
export function formatPlanDay(iso: string | null | undefined, now: Date = new Date()): string {
   if (!iso) return '';
   const day = parseISO(iso);
   if (!isValid(day)) return '';
   return format(day, day.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}
