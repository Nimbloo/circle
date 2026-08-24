import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { cycle as cycleT, issue as issueT, status as statusT, team as teamT } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
import {
   type CycleScheduleSettings,
   deriveStatus,
   planEnsure,
   addDays,
   cycleEnd,
} from './cycle-schedule';

type CycleRow = typeof cycleT.$inferSelect;

/** "Hoje" em ISO (yyyy-mm-dd, UTC) no runtime do request. */
function todayISO(): string {
   return new Date().toISOString().slice(0, 10);
}

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
   /** Cooldown (semanas) que segue este ciclo. */
   cooldownWeeks: number;
   /** Velocidade do time (média de completed dos últimos 3 ciclos fechados). */
   velocity: number;
   burnup: BurnupPoint[] | null;
}

interface Agg {
   scope: number;
   started: number;
   completed: number;
}

/** Lê as settings de ciclo do time (com defaults sãos). */
function settingsOf(team: typeof teamT.$inferSelect): CycleScheduleSettings {
   return {
      durationWeeks: team.cycleDurationWeeks,
      startDay: team.cycleStartDay,
      cooldownWeeks: team.cycleCooldownWeeks,
      upcomingCount: team.cycleUpcomingCount,
   };
}

/**
 * Velocidade do time = média de `completed` (snapshot quando houver) dos até 3 ciclos
 * mais recentes JÁ FECHADOS (endDate < hoje). Usada pra estimar a capacity dos ciclos
 * futuros. Sem histórico → 0 (o chamador cai no nº de membros como fallback).
 */
function computeVelocity(rows: CycleRow[], aggs: Map<string, Agg>, today: string): number {
   const completed = rows
      .filter((r) => r.endDate < today)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))
      .slice(0, 3);
   if (completed.length === 0) return 0;
   const total = completed.reduce((sum, r) => {
      const done = r.snapshotCompleted ?? aggs.get(r.id)?.completed ?? 0;
      return sum + done;
   }, 0);
   return Math.round(total / completed.length);
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
 * Burn-up simplificado (2 pontos: início→hoje) a partir dos agregados. Série histórica
 * real exigiria snapshots diários (fase futura); aproximamos sem inventar intermediários.
 */
function buildBurnup(row: CycleRow, agg: Agg, status: string): BurnupPoint[] | null {
   if (status !== 'current' && status !== 'completed') return null;
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

/**
 * DTO do ciclo. Status é DERIVADO das datas + hoje (não mais armazenado/stale). Ciclos
 * FECHADOS usam o snapshot congelado (histórico é a verdade). `capacity` dos ciclos não
 * fechados = quão cheio o ciclo está vs a velocidade do time (scope/velocity), a "dial"
 * do Linear; sem histórico usa o campo `capacity` (fallback do nº de membros).
 */
function toDto(row: CycleRow, liveAgg: Agg, velocity: number, today: string): CycleDto {
   const status = deriveStatus(row.startDate, row.endDate, today);
   const useSnapshot = status === 'completed' && row.snapshotScope != null;
   const agg: Agg = useSnapshot
      ? {
           scope: row.snapshotScope!,
           started: row.snapshotStarted ?? 0,
           completed: row.snapshotCompleted ?? 0,
        }
      : liveAgg;
   const successRate =
      status === 'completed' && agg.scope > 0 ? Math.round((agg.completed / agg.scope) * 100) : null;
   const capacity =
      status !== 'completed' && velocity > 0
         ? Math.min(999, Math.round((agg.scope / velocity) * 100))
         : row.capacity;
   return {
      id: row.id,
      number: row.number,
      name: row.name,
      teamId: row.teamId,
      status,
      startDate: row.startDate,
      endDate: row.endDate,
      capacity,
      scope: agg.scope,
      started: agg.started,
      completed: agg.completed,
      scopeDelta: 0, // exige histórico diário (fase futura)
      successRate,
      cooldownWeeks: row.cooldownWeeks,
      velocity,
      burnup: buildBurnup(row, agg, status),
   };
}

/** Monta os DTOs de um conjunto de ciclos DO MESMO time (compartilham velocity). */
async function toDtos(db: Db, rows: CycleRow[], today: string): Promise<CycleDto[]> {
   if (rows.length === 0) return [];
   const aggs = await aggregatesByCycle(
      db,
      rows.map((r) => r.id)
   );
   // Velocity é por-time; agrupa e computa uma vez por time.
   const byTeam = new Map<string, CycleRow[]>();
   for (const r of rows) byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r]);
   const velocityByTeam = new Map<string, number>();
   for (const [teamId, teamRows] of byTeam)
      velocityByTeam.set(teamId, computeVelocity(teamRows, aggs, today));
   return rows.map((r) =>
      toDto(r, aggs.get(r.id) ?? { scope: 0, started: 0, completed: 0 }, velocityByTeam.get(r.teamId) ?? 0, today)
   );
}

export async function listCyclesByTeam(db: Db, teamId: string): Promise<CycleDto[]> {
   await ensureCycles(db, teamId); // auto-gera/mantém o schedule (lazy)
   const rows = await db.select().from(cycleT).where(eq(cycleT.teamId, teamId));
   const dtos = await toDtos(db, rows, todayISO());
   return dtos.sort((a, b) => b.number - a.number);
}

/**
 * Cycles de VÁRIOS times de uma vez. Garante o schedule de cada time (lazy) e monta os
 * DTOs num batch (velocity por-time). Usado no bootstrap do workspace — fim do N+1.
 */
export async function listCyclesForTeams(db: Db, teamIds: string[]): Promise<CycleDto[]> {
   if (teamIds.length === 0) return [];
   await Promise.all(teamIds.map((t) => ensureCycles(db, t)));
   const rows = await db.select().from(cycleT).where(inArray(cycleT.teamId, teamIds));
   const dtos = await toDtos(db, rows, todayISO());
   return dtos.sort((a, b) => b.number - a.number);
}

export async function getCycle(db: Db, id: string): Promise<CycleDto | null> {
   const rows = await db.select().from(cycleT).where(eq(cycleT.id, id)).limit(1);
   if (rows.length === 0) return null;
   // Carrega os ciclos do MESMO time para a velocity (média dos últimos fechados).
   const teamRows = await db.select().from(cycleT).where(eq(cycleT.teamId, rows[0].teamId));
   const dtos = await toDtos(db, teamRows, todayISO());
   return dtos.find((d) => d.id === id) ?? null;
}

// ── Settings de ciclo do time (Linear: automáticos e repetitivos) ────────
export interface CycleSettingsDto {
   enabled: boolean;
   durationWeeks: number;
   startDay: number;
   cooldownWeeks: number;
   upcomingCount: number;
   autoAdd: boolean;
}

function teamToSettingsDto(t: typeof teamT.$inferSelect): CycleSettingsDto {
   return {
      enabled: t.cyclesEnabled,
      durationWeeks: t.cycleDurationWeeks,
      startDay: t.cycleStartDay,
      cooldownWeeks: t.cycleCooldownWeeks,
      upcomingCount: t.cycleUpcomingCount,
      autoAdd: t.cycleAutoAdd,
   };
}

export async function getCycleSettings(db: Db, teamId: string): Promise<CycleSettingsDto | null> {
   const rows = await db.select().from(teamT).where(eq(teamT.id, teamId)).limit(1);
   return rows.length ? teamToSettingsDto(rows[0]) : null;
}

export interface UpdateCycleSettingsInput {
   enabled?: boolean;
   durationWeeks?: number;
   startDay?: number;
   cooldownWeeks?: number;
   upcomingCount?: number;
   autoAdd?: boolean;
}

/** Atualiza as settings de ciclo do time e (re)gera o schedule se estiver habilitado. */
export async function updateCycleSettings(
   db: Db,
   teamId: string,
   patch: UpdateCycleSettingsInput
): Promise<CycleSettingsDto> {
   const rows = await db.select().from(teamT).where(eq(teamT.id, teamId)).limit(1);
   if (rows.length === 0) throw new ApiError(404, `Team '${teamId}' não existe`);

   const set: Record<string, unknown> = {};
   if (patch.enabled !== undefined) set.cyclesEnabled = patch.enabled;
   if (patch.durationWeeks !== undefined)
      set.cycleDurationWeeks = Math.min(8, Math.max(1, patch.durationWeeks));
   if (patch.startDay !== undefined) set.cycleStartDay = Math.min(6, Math.max(0, patch.startDay));
   if (patch.cooldownWeeks !== undefined)
      set.cycleCooldownWeeks = Math.min(4, Math.max(0, patch.cooldownWeeks));
   if (patch.upcomingCount !== undefined)
      set.cycleUpcomingCount = Math.min(15, Math.max(1, patch.upcomingCount));
   if (patch.autoAdd !== undefined) set.cycleAutoAdd = patch.autoAdd;

   if (Object.keys(set).length > 0)
      await db.update(teamT).set(set).where(eq(teamT.id, teamId));

   // Desabilitar: marca tudo e some com os futuros (Linear). Habilitar/ajustar: (re)gera.
   if (patch.enabled === false) {
      const today = todayISO();
      await db
         .delete(cycleT)
         .where(and(eq(cycleT.teamId, teamId), sql`${cycleT.startDate} > ${today}`));
   } else {
      await ensureCycles(db, teamId);
   }

   publish({ entity: 'cycle', action: 'updated' });
   return (await getCycleSettings(db, teamId))!;
}

/**
 * Mantém o schedule do time (estilo Linear): (1) auto-gera ciclos futuros p/ ter
 * `upcomingCount` à frente + garantir um current; (2) congela o snapshot histórico dos
 * ciclos recém-fechados; (3) faz o rollover das issues abertas do ciclo fechado pro
 * current. Idempotente e lazy (roda nas listagens). `today` injetável p/ teste.
 */
export async function ensureCycles(db: Db, teamId: string, today = todayISO()): Promise<void> {
   const teams = await db.select().from(teamT).where(eq(teamT.id, teamId)).limit(1);
   const team = teams[0];
   if (!team || !team.cyclesEnabled) return;
   const s = settingsOf(team);

   const existing = await db.select().from(cycleT).where(eq(cycleT.teamId, teamId));
   const plan = planEnsure(
      existing.map((c) => ({
         number: c.number,
         startDate: c.startDate,
         endDate: c.endDate,
         cooldownWeeks: c.cooldownWeeks,
      })),
      s,
      today
   );
   if (plan.toCreate.length) {
      await db
         .insert(cycleT)
         .values(
            plan.toCreate.map((p) => ({
               id: randomUUID(),
               number: p.number,
               name: `Cycle ${p.number}`,
               teamId,
               status: 'upcoming', // legado; o status real é derivado das datas
               startDate: p.startDate,
               endDate: p.endDate,
               capacity: 0,
               cooldownWeeks: p.cooldownWeeks,
            }))
         )
         .onConflictDoNothing();
   }

   // Snapshot + rollover dos recém-fechados.
   const all = plan.toCreate.length
      ? await db.select().from(cycleT).where(eq(cycleT.teamId, teamId))
      : existing;
   const current = all.find((c) => deriveStatus(c.startDate, c.endDate, today) === 'current');
   const justClosed = all.filter(
      (c) => deriveStatus(c.startDate, c.endDate, today) === 'completed' && c.snapshotScope == null
   );
   if (justClosed.length) {
      const aggs = await aggregatesByCycle(
         db,
         justClosed.map((c) => c.id)
      );
      for (const c of justClosed) {
         const a = aggs.get(c.id) ?? { scope: 0, started: 0, completed: 0 };
         // 1º congela o snapshot (scope inclui as abertas), DEPOIS rola as abertas.
         await db
            .update(cycleT)
            .set({ snapshotScope: a.scope, snapshotStarted: a.started, snapshotCompleted: a.completed })
            .where(eq(cycleT.id, c.id));
         if (current) await rolloverOpenIssues(db, c.id, current.id);
      }
   }
}

/** Move as issues ABERTAS (não completed/canceled) de um ciclo para outro. */
async function rolloverOpenIssues(db: Db, fromCycleId: string, toCycleId: string): Promise<void> {
   const statuses = await db.select().from(statusT);
   const closedIds = statuses
      .filter((s) => s.category === 'completed' || s.category === 'canceled')
      .map((s) => s.id);
   const conds = [eq(issueT.cycleId, fromCycleId)];
   if (closedIds.length) conds.push(notInArray(issueT.statusId, closedIds));
   await db.update(issueT).set({ cycleId: toCycleId }).where(and(...conds));
}

/**
 * "Start cycle today" (Linear): encerra o ciclo corrente ontem e inicia o próximo HOJE
 * (preservando a duração). O ensure congela o snapshot do encerrado e rola as abertas.
 */
export async function startCycleToday(db: Db, teamId: string): Promise<void> {
   const today = todayISO();
   const teams = await db.select().from(teamT).where(eq(teamT.id, teamId)).limit(1);
   if (!teams.length) throw new ApiError(404, `Team '${teamId}' não existe`);
   const dur = teams[0].cycleDurationWeeks;

   const all = await db.select().from(cycleT).where(eq(cycleT.teamId, teamId));
   const current = all.find((c) => deriveStatus(c.startDate, c.endDate, today) === 'current');
   if (!current) throw new ApiError(400, 'Não há ciclo corrente para encerrar');

   await db.update(cycleT).set({ endDate: addDays(today, -1) }).where(eq(cycleT.id, current.id));
   const upcoming = all
      .filter((c) => c.startDate > current.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
   if (upcoming)
      await db
         .update(cycleT)
         .set({ startDate: today, endDate: cycleEnd(today, dur) })
         .where(eq(cycleT.id, upcoming.id));

   await ensureCycles(db, teamId, today); // snapshot do encerrado + rollover + top-up
   publish({ entity: 'cycle', action: 'updated' });
}

/** "End cycle early" (Linear): encerra o ciclo ao fim do dia de hoje. */
export async function endCycleEarly(db: Db, id: string): Promise<void> {
   const today = todayISO();
   const rows = await db.select().from(cycleT).where(eq(cycleT.id, id)).limit(1);
   if (!rows.length) throw new ApiError(404, `Cycle '${id}' não encontrado`);
   await db.update(cycleT).set({ endDate: today }).where(eq(cycleT.id, id));
   publish({ entity: 'cycle', action: 'updated' });
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
