import { format, parseISO } from 'date-fns';

export type CycleStatus = 'upcoming' | 'current' | 'completed';

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
   /** Number of issues started but not completed. */
   started: number;
   /** Number of completed issues. */
   completed: number;
   /** Completed / scope, for finished cycles ("67% success"). */
   successRate?: number;
   /** Cooldown (semanas) que segue este ciclo. */
   cooldownWeeks?: number;
   /** Velocidade do time (média de completed dos últimos 3 ciclos fechados). */
   velocity?: number;
   /** Burn-up chart points (only meaningful for current / completed cycles). */
   burnup?: CycleBurnupPoint[];
}

export function formatCycleDateRange(cycle: Cycle): string {
   return `${format(parseISO(cycle.startDate), 'MMM d')} → ${format(parseISO(cycle.endDate), 'MMM d')}`;
}

export const cycleStatusLabel: Record<CycleStatus, string> = {
   upcoming: 'Upcoming',
   current: 'Current',
   completed: 'Completed',
};
