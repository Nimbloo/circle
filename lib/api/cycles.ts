import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { cycle as cycleT, issue as issueT, status as statusT, team as teamT } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';

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
   const rows = await db
      .select()
      .from(cycleT)
      // orderBy determinístico: sem ele, com vários 'upcoming' o resultado era arbitrário
      // (ordem do heap). O mais próximo (menor startDate) é o "próximo" correto.
      .where(and(eq(cycleT.teamId, teamId), eq(cycleT.status, status)))
      .orderBy(asc(cycleT.startDate))
      .limit(1);
   if (rows.length === 0) return null;
   const match = rows[0];
   const aggs = await aggregatesByCycle(db, [match.id]);
   return toDto(match, aggs.get(match.id) ?? { scope: 0, started: 0, completed: 0 });
}

// ── Mutações ─────────────────────────────────────────────────────────
export type CycleStatus = 'planned' | 'upcoming' | 'current' | 'completed';

export interface CreateCycleInput {
   teamId: string;
   name: string;
   startDate: string;
   endDate: string;
   status?: CycleStatus;
   capacity?: number;
}

/** Cria um ciclo no time: auto-numera (max(number)+1), valida team e datas. */
export async function createCycle(db: Db, input: CreateCycleInput): Promise<CycleDto> {
   const teamRows = await db.select().from(teamT).where(eq(teamT.id, input.teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(404, `Team '${input.teamId}' não existe`);

   if (input.startDate > input.endDate) throw new ApiError(400, 'startDate deve ser <= endDate');

   const maxRows = await db
      .select({ m: sql<number | null>`max(${cycleT.number})` })
      .from(cycleT)
      .where(eq(cycleT.teamId, input.teamId));
   const number = (maxRows[0]?.m ?? 0) + 1;

   const id = randomUUID();
   await db.insert(cycleT).values({
      id,
      number,
      name: input.name,
      teamId: input.teamId,
      status: input.status ?? 'planned',
      startDate: input.startDate,
      endDate: input.endDate,
      capacity: input.capacity ?? 0,
   });

   publish({ entity: 'cycle', action: 'created', id });
   return (await getCycle(db, id))!;
}

export interface UpdateCycleInput {
   name?: string;
   status?: CycleStatus;
   startDate?: string;
   endDate?: string;
   capacity?: number;
}

/** Patch parcial de um ciclo; valida datas resultantes. Retorna DTO ou null. */
export async function updateCycle(
   db: Db,
   id: string,
   patch: UpdateCycleInput
): Promise<CycleDto | null> {
   const existing = await db.select().from(cycleT).where(eq(cycleT.id, id)).limit(1);
   if (existing.length === 0) return null;
   const prev = existing[0];

   const startDate = patch.startDate ?? prev.startDate;
   const endDate = patch.endDate ?? prev.endDate;
   if (startDate > endDate) throw new ApiError(400, 'startDate deve ser <= endDate');

   const set: Record<string, unknown> = {};
   if (patch.name !== undefined) set.name = patch.name;
   if (patch.status !== undefined) set.status = patch.status;
   if (patch.startDate !== undefined) set.startDate = patch.startDate;
   if (patch.endDate !== undefined) set.endDate = patch.endDate;
   if (patch.capacity !== undefined) set.capacity = patch.capacity;

   if (Object.keys(set).length > 0) {
      await db.update(cycleT).set(set).where(eq(cycleT.id, id));
   }

   publish({ entity: 'cycle', action: 'updated', id });
   return getCycle(db, id);
}

/** Desassocia as issues (cycle_id=NULL) e remove o ciclo. Retorna boolean. */
export async function deleteCycle(db: Db, id: string): Promise<boolean> {
   const existing = await db
      .select({ id: cycleT.id })
      .from(cycleT)
      .where(eq(cycleT.id, id))
      .limit(1);
   if (existing.length === 0) return false;
   // Transacional: se o delete falhar, as issues não podem ficar desassociadas.
   await db.transaction(async (tx) => {
      await tx.update(issueT).set({ cycleId: null }).where(eq(issueT.cycleId, id));
      await tx.delete(cycleT).where(eq(cycleT.id, id));
   });
   publish({ entity: 'cycle', action: 'deleted', id });
   return true;
}
