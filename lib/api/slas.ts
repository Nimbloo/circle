import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { teamSla, team as teamT, priority as priorityT } from '@/db/schema';
import { ApiError } from './errors';
import { slaDueAt, slaDueDate } from '@/lib/sla';

/**
 * SLAs por time (#97): uma linha por (time, prioridade) com o prazo em horas. Quando uma
 * issue é criada — ou tem a prioridade trocada — SEM data manual, o prazo vira `due_date`
 * e a issue ganha `sla_applied_at` (ver `applySla`, usado por `lib/api/issues.ts`).
 */

export interface TeamSlaDto {
   teamId: string;
   priorityId: string;
   hours: number;
}

/** Teto de 1 ano em horas — evita prazo absurdo e overflow de data. */
export const MAX_SLA_HOURS = 8760;

export async function listTeamSlas(db: Db, teamId: string): Promise<TeamSlaDto[]> {
   const rows = await db
      .select()
      .from(teamSla)
      .where(eq(teamSla.teamId, teamId))
      .orderBy(asc(teamSla.priorityId));
   return rows.map((r) => ({ teamId: r.teamId, priorityId: r.priorityId, hours: r.hours }));
}

/** Define (ou remove, com `hours = null`) o SLA de uma prioridade. Devolve a lista do time. */
export async function setTeamSla(
   db: Db,
   teamId: string,
   priorityId: string,
   hours: number | null
): Promise<TeamSlaDto[]> {
   const [team] = await db
      .select({ id: teamT.id })
      .from(teamT)
      .where(eq(teamT.id, teamId))
      .limit(1);
   if (!team) throw new ApiError(404, `Team '${teamId}' não encontrado`);
   const [prio] = await db
      .select({ id: priorityT.id })
      .from(priorityT)
      .where(eq(priorityT.id, priorityId))
      .limit(1);
   if (!prio) throw new ApiError(400, `Priority '${priorityId}' não existe`);

   if (hours === null) {
      await db
         .delete(teamSla)
         .where(and(eq(teamSla.teamId, teamId), eq(teamSla.priorityId, priorityId)));
   } else {
      if (!Number.isInteger(hours) || hours < 1 || hours > MAX_SLA_HOURS)
         throw new ApiError(400, `hours deve ser inteiro entre 1 e ${MAX_SLA_HOURS}`);
      await db
         .insert(teamSla)
         .values({ teamId, priorityId, hours })
         .onConflictDoUpdate({ target: [teamSla.teamId, teamSla.priorityId], set: { hours } });
   }
   return listTeamSlas(db, teamId);
}

/** Prazo em horas do SLA de (time, prioridade); null quando a prioridade não tem SLA. */
export async function slaHours(db: Db, teamId: string, priorityId: string): Promise<number | null> {
   const [row] = await db
      .select({ hours: teamSla.hours })
      .from(teamSla)
      .where(and(eq(teamSla.teamId, teamId), eq(teamSla.priorityId, priorityId)))
      .limit(1);
   return row?.hours ?? null;
}

export interface AppliedSla {
   /** Data humana (`YYYY-MM-DD`) mostrada na UI — derivada do `dueAt`. */
   dueDate: string;
   /** Vencimento REAL, com hora: é o que o indicador de SLA usa. */
   dueAt: Date;
   slaAppliedAt: Date;
   hours: number;
}

/**
 * Calcula o SLA de (time, prioridade) a partir de `now`. null = prioridade sem SLA.
 * Quem grava (create/update de issue) é `lib/api/issues.ts` — aqui só o cálculo.
 *
 * O `dueAt` é a janela contratada exata (`now + hours`); o `dueDate` é a projeção em
 * data para a UI. A coluna `issue.sla_due_at` é mantida coerente pela trigger da
 * migration `0046_sla_due_at`, que vale para qualquer caminho de escrita — inclusive
 * a regra de nunca AFROUXAR um SLA por troca de prioridade.
 */
export async function applySla(
   db: Db,
   teamId: string,
   priorityId: string,
   now: Date = new Date()
): Promise<AppliedSla | null> {
   const hours = await slaHours(db, teamId, priorityId);
   if (hours === null) return null;
   return {
      dueDate: slaDueDate(now, hours),
      dueAt: slaDueAt(now, hours),
      slaAppliedAt: now,
      hours,
   };
}
