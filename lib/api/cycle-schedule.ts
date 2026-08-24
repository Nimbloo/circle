/**
 * Lógica PURA de agendamento de Cycles (estilo Linear: automáticos e repetitivos).
 * Datas são ISO puras (yyyy-mm-dd) em UTC — sem fuso, determinístico e testável.
 * Nada de `Date.now()` aqui: o "hoje" é sempre injetado pelo chamador.
 */

export interface CycleScheduleSettings {
   /** Duração de cada ciclo em semanas (1–8). */
   durationWeeks: number;
   /** Dia da semana em que o ciclo começa (0=domingo … 6=sábado). */
   startDay: number;
   /** Cooldown em semanas entre ciclos (0 = sem cooldown). */
   cooldownWeeks: number;
   /** Quantos ciclos futuros manter pré-criados (1–15). */
   upcomingCount: number;
}

export interface PlannedCycle {
   startDate: string;
   endDate: string;
   cooldownWeeks: number;
}

function parseISO(s: string): Date {
   return new Date(`${s}T00:00:00Z`);
}
function toISO(d: Date): string {
   return d.toISOString().slice(0, 10);
}
export function addDays(s: string, n: number): string {
   const d = parseISO(s);
   d.setUTCDate(d.getUTCDate() + n);
   return toISO(d);
}
function weekday(s: string): number {
   return parseISO(s).getUTCDay();
}

/** A data <= `s` cujo dia-da-semana === startDay (âncora do ciclo que contém `s`). */
export function alignToStartDay(s: string, startDay: number): string {
   const back = (weekday(s) - startDay + 7) % 7;
   return addDays(s, -back);
}

/** Fim (inclusivo) de um ciclo que começa em `start` e dura `durationWeeks`. */
export function cycleEnd(start: string, durationWeeks: number): string {
   return addDays(start, durationWeeks * 7 - 1);
}

/** Início do PRÓXIMO ciclo após um que termina em `end` com `cooldownWeeks` de gap. */
export function nextStart(end: string, cooldownWeeks: number): string {
   return addDays(end, 1 + cooldownWeeks * 7);
}

/** Gera `count` ciclos consecutivos a partir de `anchorStart`. */
export function generateSchedule(
   anchorStart: string,
   s: CycleScheduleSettings,
   count: number
): PlannedCycle[] {
   const out: PlannedCycle[] = [];
   let start = anchorStart;
   for (let i = 0; i < count; i++) {
      const end = cycleEnd(start, s.durationWeeks);
      out.push({ startDate: start, endDate: end, cooldownWeeks: s.cooldownWeeks });
      start = nextStart(end, s.cooldownWeeks);
   }
   return out;
}

/** Status DERIVADO das datas + hoje (não mais armazenado/stale). */
export function deriveStatus(startDate: string, endDate: string, todayISO: string): string {
   if (todayISO < startDate) return 'upcoming';
   if (todayISO > endDate) return 'completed';
   return 'current';
}

export interface ExistingCycleLite {
   number: number;
   startDate: string;
   endDate: string;
   cooldownWeeks: number;
}

export interface EnsurePlan {
   /** Ciclos NOVOS a inserir (com número sequencial já atribuído). */
   toCreate: (PlannedCycle & { number: number })[];
}

/**
 * Decide quais ciclos NOVOS criar para manter `upcomingCount` ciclos futuros (start > hoje)
 * e garantir que exista um ciclo cobrindo hoje. Idempotente: se já há ciclos suficientes,
 * `toCreate` é vazio. Re-ancora em hoje se houve um gap (time pausou os ciclos).
 */
export function planEnsure(
   existing: ExistingCycleLite[],
   s: CycleScheduleSettings,
   todayISO: string
): EnsurePlan {
   const sorted = [...existing].sort((a, b) => a.number - b.number);
   const maxNumber = sorted.reduce((m, c) => Math.max(m, c.number), 0);
   const upcomingExisting = sorted.filter((c) => c.startDate > todayISO).length;
   const hasCurrentOrPast = sorted.some((c) => c.startDate <= todayISO);

   // Âncora do próximo ciclo a gerar:
   const alignedToday = alignToStartDay(todayISO, s.startDay);
   let anchor: string;
   if (sorted.length === 0) {
      anchor = alignedToday; // 1º ciclo cobre hoje
   } else {
      const last = sorted[sorted.length - 1];
      const afterLast = nextStart(last.endDate, last.cooldownWeeks);
      // Se o próximo cairia no passado (time pausou), re-ancora em hoje (gap = "Cycles paused").
      anchor = afterLast > alignedToday ? afterLast : alignedToday;
   }

   // Gera até ter `upcomingCount` ciclos FUTUROS (start > hoje) E garantir que exista um
   // ciclo cobrindo hoje/passado (o current). O current NÃO conta em `futureCount`.
   const toCreate: (PlannedCycle & { number: number })[] = [];
   let start = anchor;
   let futureCount = upcomingExisting;
   let hasCurrent = hasCurrentOrPast;
   let n = maxNumber + 1;
   // guarda contra loop infinito (settings sãs → poucos ciclos)
   for (let guard = 0; guard < 60 && (futureCount < s.upcomingCount || !hasCurrent); guard++) {
      const end = cycleEnd(start, s.durationWeeks);
      toCreate.push({ startDate: start, endDate: end, cooldownWeeks: s.cooldownWeeks, number: n });
      if (start > todayISO) futureCount += 1;
      else hasCurrent = true;
      n += 1;
      start = nextStart(end, s.cooldownWeeks);
   }
   return { toCreate };
}
