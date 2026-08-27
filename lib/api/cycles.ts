import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
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

/**
 * Auto-rollover (#24): quando o cycle 'current' de um time vence (endDate < hoje),
 * fecha ele, carrega as issues INCOMPLETAS (não completed/canceled) pro próximo
 * 'upcoming', e promove esse próximo a 'current' se já começou. Idempotente e lazy
 * (rodado ao listar os cycles do time; o app não tem scheduler).
 */
export async function rolloverCyclesForTeam(db: Db, teamId: string): Promise<void> {
   const today = new Date().toISOString().slice(0, 10);
   const [current] = await db
      .select()
      .from(cycleT)
      .where(and(eq(cycleT.teamId, teamId), eq(cycleT.status, 'current')))
      .limit(1);
   if (!current || current.endDate >= today) return; // sem current ou ainda em andamento

   const [next] = await db
      .select()
      .from(cycleT)
      .where(and(eq(cycleT.teamId, teamId), eq(cycleT.status, 'upcoming')))
      .orderBy(asc(cycleT.number))
      .limit(1);

   const statuses = await db.select().from(statusT);
   // Paridade Linear: só issues "em aberto" (unstarted/started) rolam pro próximo ciclo.
   // Backlog, triage, completed e canceled NÃO são carregadas (a doc do Linear exclui
   // explicitamente backlog+triage, além de completed/canceled).
   const noCarry = new Set(['backlog', 'triage', 'completed', 'canceled']);
   const excludeIds = statuses.filter((s) => noCarry.has(s.category)).map((s) => s.id);

   if (next) {
      // carrega as issues em aberto do current pro próximo cycle
      await db
         .update(issueT)
         .set({ cycleId: next.id, updatedAt: new Date() })
         .where(
            and(
               eq(issueT.cycleId, current.id),
               excludeIds.length ? notInArray(issueT.statusId, excludeIds) : sql`true`
            )
         );
   }
   await db.update(cycleT).set({ status: 'completed' }).where(eq(cycleT.id, current.id));
   if (next && next.startDate <= today) {
      await db.update(cycleT).set({ status: 'current' }).where(eq(cycleT.id, next.id));
   }
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

/**
 * Cycles de VÁRIOS times de uma vez, em 2 queries no total (1 cycles + 1 aggregate
 * pra todos os ids), em vez de N chamadas de listCyclesByTeam (cada uma re-escaneando
 * a tabela status). Usado no bootstrap do workspace — fim do N+1.
 */
export async function listCyclesForTeams(db: Db, teamIds: string[]): Promise<CycleDto[]> {
   if (teamIds.length === 0) return [];
   const rows = await db.select().from(cycleT).where(inArray(cycleT.teamId, teamIds));
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

   // `max(number)+1` não é atômico; dois POSTs concorrentes no mesmo time computam o
   // mesmo número e o 2º viola `cycle_team_id_number_unique`. Retry recomputando o max
   // transforma isso em "próximo número" em vez de 409 numa criação legítima.
   const id = randomUUID();
   for (let attempt = 0; attempt < 4; attempt++) {
      const maxRows = await db
         .select({ m: sql<number | null>`max(${cycleT.number})` })
         .from(cycleT)
         .where(eq(cycleT.teamId, input.teamId));
      const number = (maxRows[0]?.m ?? 0) + 1;
      try {
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
      } catch (e) {
         // 23505 na constraint de (team, number) → corrida: recomputa e retenta.
         if ((e as { code?: string })?.code === '23505' && attempt < 3) continue;
         throw e;
      }
   }
   throw new ApiError(500, 'Não foi possível numerar o ciclo (colisão concorrente)');
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
