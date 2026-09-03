/**
 * Regras puras do reschedule da timeline de projetos (arraste da barra/alças e
 * teclado). Datas são ISO `YYYY-MM-DD` e a aritmética é em UTC, para que o
 * deslocamento por dia não sofra com fuso/horário de verão.
 */

const DAY_MS = 86_400_000;

/** `move` desloca as duas datas; `start`/`end` mexem só numa ponta. */
export type RescheduleMode = 'move' | 'start' | 'end';

export interface DateRange {
   startDate: string;
   targetDate: string;
}

const toUtc = (iso: string): number =>
   Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

const toIso = (time: number): string => new Date(time).toISOString().slice(0, 10);

/** Soma `days` (pode ser negativo) a uma data ISO. */
export function shiftIsoDate(iso: string, days: number): string {
   return toIso(toUtc(iso) + days * DAY_MS);
}

/** Snap por dia: converte o deslocamento do ponteiro (px) em dias inteiros. */
export function daysFromPixels(deltaX: number, dayWidth: number): number {
   if (!(dayWidth > 0)) return 0;
   return Math.round(deltaX / dayWidth);
}

/**
 * Aplica um deslocamento em dias ao intervalo. Ao mexer numa ponta só, a data
 * nunca cruza a outra (o intervalo colapsa num dia, no máximo).
 */
export function rescheduleRange(
   range: DateRange,
   mode: RescheduleMode,
   deltaDays: number
): DateRange {
   if (deltaDays === 0) return range;
   switch (mode) {
      case 'move':
         return {
            startDate: shiftIsoDate(range.startDate, deltaDays),
            targetDate: shiftIsoDate(range.targetDate, deltaDays),
         };
      case 'start': {
         const next = shiftIsoDate(range.startDate, deltaDays);
         // ISO `YYYY-MM-DD` ordena lexicograficamente.
         return {
            startDate: next > range.targetDate ? range.targetDate : next,
            targetDate: range.targetDate,
         };
      }
      case 'end': {
         const next = shiftIsoDate(range.targetDate, deltaDays);
         return {
            startDate: range.startDate,
            targetDate: next < range.startDate ? range.startDate : next,
         };
      }
   }
}

/** ←/→ movem 1 dia; com Shift, 7. Outras teclas: `null` (não tratadas). */
export function keyboardRescheduleDelta(event: { key: string; shiftKey: boolean }): number | null {
   const step = event.shiftKey ? 7 : 1;
   if (event.key === 'ArrowLeft') return -step;
   if (event.key === 'ArrowRight') return step;
   return null;
}

export const sameRange = (a: DateRange, b: DateRange): boolean =>
   a.startDate === b.startDate && a.targetDate === b.targetDate;
