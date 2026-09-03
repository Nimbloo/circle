/**
 * Período alvo de uma initiative: o rótulo humano (`target`, ex. "Q3 2026") e a data
 * real (`targetDate`, ISO `YYYY-MM-DD`) que ele representa. Regra única, espelhada
 * no backfill SQL (`db/migrations/0037_backfill_initiative_dates.sql`).
 */

const MONTH_KEYS = 'janfebmaraprmayjunjulaugsepoctnovdec';

/** Índice 1–12 do mês a partir das três primeiras letras do nome em inglês. */
function monthIndex(name: string): number | null {
   const position = MONTH_KEYS.indexOf(name.slice(0, 3).toLowerCase());
   return position < 0 || position % 3 !== 0 ? null : position / 3 + 1;
}

const pad = (value: number) => String(value).padStart(2, '0');

const daysInMonth = (year: number, month: number) =>
   new Date(Date.UTC(year, month, 0)).getUTCDate();

function isoDate(year: number, month: number, day: number): string | null {
   if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
   return `${year}-${pad(month)}-${pad(day)}`;
}

const endOfMonth = (year: number, month: number) => isoDate(year, month, daysInMonth(year, month));

/**
 * Deriva a data-fim do período a partir do rótulo:
 *   `Q[1-4] YYYY` → último dia do trimestre · `H[12] YYYY` → 30/06 ou 31/12
 *   `YYYY` → 31/12 · `Mon YYYY` / `YYYY-MM` → último dia do mês
 *   `Mon d, YYYY` / `YYYY-MM-DD` → a própria data
 * Rótulo livre (ou data inválida) devolve `null` — o rótulo segue existindo sem data.
 */
export function targetDateFromLabel(label: string | null | undefined): string | null {
   const text = label?.trim();
   if (!text) return null;

   let match: RegExpExecArray | null;
   if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text))) {
      return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
   }
   if ((match = /^(\d{4})-(\d{2})$/.exec(text))) {
      const month = Number(match[2]);
      return month >= 1 && month <= 12 ? endOfMonth(Number(match[1]), month) : null;
   }
   if ((match = /^([a-z]{3})[a-z]* (\d{4})$/i.exec(text))) {
      const month = monthIndex(match[1]);
      return month ? endOfMonth(Number(match[2]), month) : null;
   }
   if ((match = /^([a-z]{3})[a-z]* (\d{1,2}),? (\d{4})$/i.exec(text))) {
      const month = monthIndex(match[1]);
      return month ? isoDate(Number(match[3]), month, Number(match[2])) : null;
   }
   if ((match = /^q([1-4]) (\d{4})$/i.exec(text))) {
      return endOfMonth(Number(match[2]), Number(match[1]) * 3);
   }
   if ((match = /^h([12]) (\d{4})$/i.exec(text))) {
      return endOfMonth(Number(match[2]), Number(match[1]) * 6);
   }
   if ((match = /^(\d{4})$/.exec(text))) return `${match[1]}-12-31`;
   return null;
}

const MONTH_NAMES = [
   'Jan',
   'Feb',
   'Mar',
   'Apr',
   'May',
   'Jun',
   'Jul',
   'Aug',
   'Sep',
   'Oct',
   'Nov',
   'Dec',
];

/** Rótulo de um dia específico no formato que o parser aceita ("May 20, 2027"). */
export function dayLabel(iso: string): string {
   const [year, month, day] = iso.split('-').map(Number);
   return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

/** Data ISO (`YYYY-MM-DD`) de um `Date` local, sem deslocamento de fuso. */
export function toIsoDate(date: Date): string {
   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
