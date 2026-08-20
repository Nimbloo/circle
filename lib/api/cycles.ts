import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { cycle as cycleT, issue as issueT, status as statusT } from '@/db/schema';

type CycleRow = typeof cycleT.$inferSelect;

export interface BurnupPoint {
   date: string;
   scope: number;
   started: number;
   completed: number;
   ideal: number;
}

export interface CycleDto {
   id: string;
   number: number;
   name: string;
   teamId: string;
   status: string;
   startDate: string;
   endDate: string;
   capacity: number;
   scope: number;
   started: number;
   completed: number;
   scopeDelta: number;
   successRate: number | null;
   burnup: BurnupPoint[] | null;
}

interface Agg {
   scope: number;
   started: number;
   completed: number;
}

/** Conta scope/started/completed por ciclo, a partir das issues reais. */
async function aggregatesByCycle(db: Db, cycleIds: string[]): Promise<Map<string, Agg>> {
   const result = new Map<string, Agg>();
   if (cycleIds.length === 0) return result;
   const [issues, statuses] = await Promise.all([
      db
         .select({ cycleId: issueT.cycleId, statusId: issueT.statusId })
         .from(issueT)
         .where(inArray(issueT.cycleId, cycleIds)),
      db.select().from(statusT),
   ]);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));
   for (const cid of cycleIds) result.set(cid, { scope: 0, started: 0, completed: 0 });
   for (const i of issues) {
      if (!i.cycleId) continue;
      const agg = result.get(i.cycleId);
      if (!agg) continue;
      agg.scope += 1;
      const cat = catById.get(i.statusId);
      if (cat === 'started') agg.started += 1;
      else if (cat === 'completed') agg.completed += 1;
   }
   return result;
}

/**
 * Burn-up simplificado (2 pontos: início→hoje) a partir dos agregados atuais.
 * Série histórica real exigiria snapshots diários (fase futura); aqui aproximamos
 * sem inventar dados intermediários.
 */
function buildBurnup(row: CycleRow, agg: Agg): BurnupPoint[] | null {
   if (row.status !== 'current' && row.status !== 'completed') return null;
   return [
      { date: row.startDate, scope: agg.scope, started: 0, completed: 0, ideal: 0 },
      {
         date: row.endDate,
         scope: agg.scope,
         started: agg.started,
         completed: agg.completed,
         ideal: agg.scope,
      },
   ];
}

function toDto(row: CycleRow, agg: Agg): CycleDto {
   const successRate =
      row.status === 'completed' && agg.scope > 0
         ? Math.round((agg.completed / agg.scope) * 100)
         : null;
   return {
      id: row.id,
      number: row.number,
      name: row.name,
      teamId: row.teamId,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      capacity: row.capacity,
      scope: agg.scope,
      started: agg.started,
      completed: agg.completed,
      scopeDelta: 0, // exige histórico (fase futura)
      successRate,
      burnup: buildBurnup(row, agg),
   };
}

export async function listCyclesByTeam(db: Db, teamId: string): Promise<CycleDto[]> {
   const rows = await db.select().from(cycleT).where(eq(cycleT.teamId, teamId));
   const aggs = await aggregatesByCycle(
      db,
      rows.map((r) => r.id)
   );
   return rows
      .map((r) => toDto(r, aggs.get(r.id) ?? { scope: 0, started: 0, completed: 0 }))
      .sort((a, b) => b.number - a.number);
}

export async function getCycle(db: Db, id: string): Promise<CycleDto | null> {
   const rows = await db.select().from(cycleT).where(eq(cycleT.id, id)).limit(1);
   if (rows.length === 0) return null;
   const aggs = await aggregatesByCycle(db, [id]);
   return toDto(rows[0], aggs.get(id) ?? { scope: 0, started: 0, completed: 0 });
}

export async function getCycleByStatus(
   db: Db,
   teamId: string,
   status: 'current' | 'upcoming'
): Promise<CycleDto | null> {
   const rows = await db.select().from(cycleT).where(eq(cycleT.teamId, teamId)).limit(50);
   const match = rows.find((r) => r.status === status);
   if (!match) return null;
   const aggs = await aggregatesByCycle(db, [match.id]);
   return toDto(match, aggs.get(match.id) ?? { scope: 0, started: 0, completed: 0 });
}
