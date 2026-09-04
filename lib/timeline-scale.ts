/**
 * Escala compartilhada das timelines (Projects e Roadmap): a régua determinística de
 * meses/semanas e a conversão data ↔ pixel. Módulo PURO (sem React) — o intervalo é
 * fixo e computado no import, então cliente e servidor renderizam a mesma régua (SSR
 * safe), e as duas telas usam exatamente a mesma geometria.
 */

/** Intervalo amplo e determinístico (parece infinito): Jan 2020 → Dez 2032. */
export const RANGE_START = Date.UTC(2020, 0, 1);
export const RANGE_END = Date.UTC(2032, 11, 31);
/** Largura da coluna fixa (sticky) com a lista de projetos. */
export const LIST_WIDTH = 312;
export const DAY_MS = 86_400_000;

/** Níveis de zoom do seletor de escala (largura da coluna de mês, em px). */
export const ZOOM_LEVELS = [
   { id: 'year', label: 'Year', shortcut: 'Y', monthWidth: 76 },
   { id: 'quarter', label: 'Quarter', shortcut: 'Q', monthWidth: 152 },
   { id: 'month', label: 'Month', shortcut: 'M', monthWidth: 304 },
   { id: 'week', label: 'Week', shortcut: 'W', monthWidth: 608 },
] as const;

export type TimelineZoom = (typeof ZOOM_LEVELS)[number]['id'];

export const monthWidthOf = (zoom: TimelineZoom): number =>
   ZOOM_LEVELS.find((level) => level.id === zoom)!.monthWidth;

export const dayWidthOf = (monthWidth: number): number => monthWidth / 30.4;

export interface MonthCell {
   key: string;
   label: string;
   days: number;
}

export const MONTHS: MonthCell[] = [];
for (let index = 0; ; index++) {
   const date = new Date(Date.UTC(2020, index, 1));
   if (date.getTime() > RANGE_END) break;
   MONTHS.push({
      key: date.toISOString().slice(0, 7),
      days: (Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - date.getTime()) / DAY_MS,
      label:
         date.getUTCMonth() === 0
            ? `${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${date.getUTCFullYear()}`
            : date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
   });
}

export const totalWidthOf = (monthWidth: number): number =>
   ((RANGE_END - RANGE_START) / DAY_MS + 1) * dayWidthOf(monthWidth);

/* --------------------------- Rótulos de data da régua --------------------------- */

/** Primeira segunda-feira do intervalo (6 de janeiro de 2020). */
const FIRST_MONDAY = Date.UTC(2020, 0, 6);

export interface ScaleDate {
   time: number;
   /** Dia do mês, ex.: 17. */
   day: number;
   /** Semana ISO, para a opção de display "Show week numbers". */
   week: number;
}

export const isoWeekOf = (time: number): number => {
   const date = new Date(time);
   const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
   const dayNumber = (target.getUTCDay() + 6) % 7;
   target.setUTCDate(target.getUTCDate() - dayNumber + 3);
   const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
   const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
   firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
   return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
};

/** Toda segunda-feira do intervalo (ticks semanais + rótulos com zoom próximo). */
export const WEEKLY_DATES: ScaleDate[] = [];
for (let time = FIRST_MONDAY; time <= RANGE_END; time += 7 * DAY_MS) {
   WEEKLY_DATES.push({ time, day: new Date(time).getUTCDate(), week: isoWeekOf(time) });
}
/** Segunda-feira sim, outra não (rótulos no zoom Year). */
export const BIWEEKLY_DATES: ScaleDate[] = WEEKLY_DATES.filter((_, index) => index % 2 === 0);

export const offsetForTime = (time: number, monthWidth: number): number =>
   ((time - RANGE_START) / DAY_MS) * dayWidthOf(monthWidth);

/** Offset em px de uma data ISO `YYYY-MM-DD`, presa ao intervalo da régua. */
export const offsetFor = (iso: string, monthWidth: number): number => {
   const time = Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10))
   );
   const clamped = Math.min(Math.max(time, RANGE_START), RANGE_END);
   return ((clamped - RANGE_START) / DAY_MS) * dayWidthOf(monthWidth);
};
