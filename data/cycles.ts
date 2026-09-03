import { format, parseISO } from 'date-fns';

export type CycleStatus = 'planned' | 'upcoming' | 'current' | 'completed';

/** One data point of a cycle burn-up chart. */
export interface CycleBurnupPoint {
   date: string; // ISO date (yyyy-MM-dd)
   scope: number;
   started: number;
   completed: number;
   ideal: number;
}

export interface Cycle {
   id: string;
   number: number;
   name: string;
   teamId: string;
   status: CycleStatus;
   startDate: string; // ISO date
   endDate: string; // ISO date
   /** Percentage of the team capacity currently allocated to the cycle. */
   capacity: number;
   /** Total number of issues in the cycle. */
   scope: number;
   /** Scope variation (in %) since the beginning of the cycle. */
   scopeDelta: number;
   /** Number of issues started but not completed. */
   started: number;
   /** Number of completed issues. */
   completed: number;
   /** Completed / scope, for finished cycles ("67% success"). */
   successRate?: number;
   /** Burn-up chart points (only meaningful for current / completed cycles). */
   burnup?: CycleBurnupPoint[];
}

/**
 * Generates a plausible burn-up curve between startDate and endDate.
 * Deterministic (no randomness) so SSR and client render the same chart.
 */
const generateBurnup = (
   startDate: string,
   days: number,
   startScope: number,
   endScope: number,
   completedTarget: number,
   startedTarget: number
): CycleBurnupPoint[] => {
   const points: CycleBurnupPoint[] = [];
   const start = parseISO(startDate);

   for (let i = 0; i <= days; i++) {
      const t = i / days;
      // Ease-in-out curve for completion, slightly stepped scope growth.
      const eased = t * t * (3 - 2 * t);
      const scope = Math.round(startScope + (endScope - startScope) * Math.min(1, t * 1.35));
      const completed = Math.round(completedTarget * eased);
      const started = Math.min(
         scope - completed,
         Math.round(startedTarget * (0.4 + 0.6 * Math.sin(t * Math.PI)))
      );
      const date = new Date(start);
      date.setDate(start.getDate() + i);

      points.push({
         date: format(date, 'yyyy-MM-dd'),
         scope,
         started: completed + Math.max(0, started),
         completed,
         ideal: Math.round(endScope * t),
      });
   }

   return points;
};

/**
 * Cycles of the CORE team. One `current`, one `upcoming`, one `planned`,
 * the rest `completed` — two-week iterations, most recent first.
 */
export const cycles: Cycle[] = [];

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

export function getCurrentCycle(): Cycle {
   return cycles.find((c) => c.status === 'current') ?? cycles[0];
}

export function getUpcomingCycle(): Cycle {
   return cycles.find((c) => c.status === 'upcoming') ?? cycles[0];
}

export function getCycleById(id: string): Cycle | undefined {
   return cycles.find((c) => c.id === id);
}

export function getCyclesByTeam(teamId: string): Cycle[] {
   return cycles.filter((c) => c.teamId === teamId);
}

export function formatCycleDateRange(cycle: Cycle): string {
   return `${format(parseISO(cycle.startDate), 'MMM d')} → ${format(parseISO(cycle.endDate), 'MMM d')}`;
}

/**
 * Cool-down (#24): entre o fim de um cycle e o início do próximo o time fica sem cycle
 * `current`. Retorna a data (ISO) em que o próximo cycle começa — o fim do cool-down —
 * ou null quando o time não está nesse intervalo. `cycles` já filtrados pelo time.
 */
export function cooldownUntil(cycles: Cycle[], today: string): string | null {
   if (cycles.some((c) => c.status === 'current')) return null;
   if (!cycles.some((c) => c.status === 'completed' && c.endDate < today)) return null;
   const next = cycles
      .filter((c) => c.status === 'upcoming' && c.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
   return next?.startDate ?? null;
}

/** Hoje em ISO (UTC) — mesma régua que o servidor usa no rollover. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const cycleStatusLabel: Record<CycleStatus, string> = {
   planned: 'Planned',
   upcoming: 'Upcoming',
   current: 'Current',
   completed: 'Completed',
};
