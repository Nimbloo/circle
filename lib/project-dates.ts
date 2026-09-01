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
