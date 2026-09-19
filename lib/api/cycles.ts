import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   cycle as cycleT,
   cycleSnapshot as snapshotT,
   issue as issueT,
   status as statusT,
   team as teamT,
} from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
import { workspaceDay } from '@/lib/workspace-day';

type CycleRow = typeof cycleT.$inferSelect;
type SnapshotRow = typeof snapshotT.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface BurnupPoint {
   date: string;
   /** null = dia SEM medição (lacuna no gráfico). Ver `buildBurnup`. */
   scope: number | null;
   started: number | null;
   completed: number | null;
   /** Referência calculada (não é medição): sempre presente. */
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
   /** Marcos por issue — matéria-prima da curva de burn-up (ver `buildBurnup`). */
   items: { points: number; startedAt: Date | null; completedAt: Date | null }[];
}

/**
 * Agrega scope/started/completed por ciclo em PONTOS DE ESTIMATE (paridade Linear:
 * "cycles use estimates to calculate effort"). Issue sem estimate conta como 1 ponto
 * (o mesmo default do Linear quando não há estimativa) — então times que não estimam
 * seguem vendo scope == nº de issues.
 *
 * A soma sai AGREGADA do SQL (#36); os marcos por issue (`items`, matéria-prima do
 * burn-up sintético) só são lidos para `itemCycleIds` — o bootstrap não carrega as
 * issues de todos os ciclos para descartar.
 */
async function aggregatesByCycle(
   db: Db,
   cycleIds: string[],
   itemCycleIds: readonly string[] = cycleIds
): Promise<Map<string, Agg>> {
   const result = new Map<string, Agg>();
   if (cycleIds.length === 0) return result;
   for (const cid of cycleIds) result.set(cid, { scope: 0, started: 0, completed: 0, items: [] });
   const points = sql`case when ${issueT.estimate} > 0 then ${issueT.estimate} else 1 end`;
   const [sums, items] = await Promise.all([
      db
         .select({
            cycleId: issueT.cycleId,
            scope: sql<number>`coalesce(sum(${points}), 0)`,
            started: sql<number>`coalesce(sum(${points}) filter (where ${statusT.category} = 'started'), 0)`,
            completed: sql<number>`coalesce(sum(${points}) filter (where ${statusT.category} = 'completed'), 0)`,
         })
         .from(issueT)
         .innerJoin(statusT, eq(issueT.statusId, statusT.id))
         .where(inArray(issueT.cycleId, cycleIds))
         .groupBy(issueT.cycleId),
      itemCycleIds.length
         ? db
              .select({
                 cycleId: issueT.cycleId,
                 estimate: issueT.estimate,
                 startedAt: issueT.startedAt,
                 completedAt: issueT.completedAt,
              })
              .from(issueT)
              .where(inArray(issueT.cycleId, [...itemCycleIds]))
         : Promise.resolve([]),
   ]);
   for (const row of sums) {
      const agg = row.cycleId ? result.get(row.cycleId) : undefined;
      if (!agg) continue;
      agg.scope = Number(row.scope);
      agg.started = Number(row.started);
      agg.completed = Number(row.completed);
   }
   for (const i of items) {
      const agg = i.cycleId ? result.get(i.cycleId) : undefined;
      if (!agg) continue;
      const p = i.estimate && i.estimate > 0 ? i.estimate : 1; // fallback 1/issue
      agg.items.push({ points: p, startedAt: i.startedAt, completedAt: i.completedAt });
   }
   return result;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** `iso` + `n` dias (UTC), em `YYYY-MM-DD`. */
function addDays(iso: string, n: number): string {
   const d = new Date(`${iso}T00:00:00Z`);
   d.setUTCDate(d.getUTCDate() + n);
   return isoDay(d);
}

/** Dias inteiros entre dois ISO (`to - from`). */
function diffDays(from: string, to: string): number {
   return Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
   );
}

/** Dias (ISO `YYYY-MM-DD`) de `from` até `to`, inclusive. Cap de 120 por segurança. */
function daysBetween(from: string, to: string): string[] {
   const out: string[] = [];
   const cur = new Date(`${from}T00:00:00Z`);
   const end = new Date(`${to}T00:00:00Z`);
   while (cur <= end && out.length < 120) {
      out.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
   }
   return out;
}

/**
 * Curva de burn-up DIÁRIA. Com >= 2 snapshots (`cycle_snapshot`, gravados no rollover
 * e no GET do detalhe) a série vem deles — scope, started e completed REAIS por dia.
 *
 * Dia sem snapshot vira LACUNA (`null`), não reta: antes os dias sem medição eram
 * interpolados linearmente, e um ciclo sem acesso por 15 dias desenhava uma cadência
 * diária que nunca existiu (e "segurava" o primeiro/último valor para fora do intervalo
 * medido). O gráfico corta a linha na lacuna e marca com ponto o que foi medido.
 *
 * Sem histórico suficiente cai no sintético: `started`/`completed` reconstruídos de
 * `issue.startedAt`/`completedAt` e `scope` PLANO (não há registro de quando a issue
 * entrou no ciclo) — aí todo dia tem valor, porque cada dia É calculado dos marcos.
 *
 * O sintético é enviesado por sobrevivência em ciclos passados: issue que saiu do
 * ciclo já não aponta para ele e some da série. Aceitável para tendência.
 */
function buildBurnup(
   row: CycleRow,
   agg: Agg,
   snapshots: SnapshotRow[],
   today: string
): BurnupPoint[] | null {
   if (row.status !== 'current' && row.status !== 'completed') return null;

   // Ciclo em andamento para de desenhar em hoje: dia futuro viraria linha reta no zero.
   const last = row.status === 'current' && today < row.endDate ? today : row.endDate;
   const days = daysBetween(row.startDate, last);
   if (days.length === 0) return null;
   const span = days.length - 1;
   const ideal = (idx: number) => (span === 0 ? agg.scope : Math.round((agg.scope * idx) / span));

   if (snapshots.length >= 2) {
      const byDate = new Map(snapshots.map((s) => [s.date, s]));
      return days.map((date, idx) => {
         const snap = byDate.get(date);
         return {
            date,
            scope: snap?.scope ?? null,
            started: snap?.started ?? null,
            completed: snap?.completed ?? null,
            ideal: ideal(idx),
         };
      });
   }

   const iso = (d: Date | null) => (d ? workspaceDay(d) : null);
   return days.map((date, idx) => {
      let started = 0;
      let completed = 0;
      for (const it of agg.items) {
         const s = iso(it.startedAt);
         const c = iso(it.completedAt);
         // Cumulativo: conta quem já tinha atingido o marco ATÉ este dia.
         if (c && c <= date) completed += it.points;
         else if (s && s <= date) started += it.points;
      }
      return { date, scope: agg.scope, started, completed, ideal: ideal(idx) };
   });
}

function toDto(row: CycleRow, agg: Agg, snapshots: SnapshotRow[], today: string): CycleDto {
   const successRate =
      row.status === 'completed' && agg.scope > 0
         ? Math.round((agg.completed / agg.scope) * 100)
         : null;
   // Variação de escopo (%) desde o primeiro snapshot do ciclo; 0 sem histórico.
   const first = snapshots[0];
   const scopeDelta =
      first && first.scope > 0 ? Math.round(((agg.scope - first.scope) / first.scope) * 100) : 0;
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
      scopeDelta,
      successRate,
      burnup: buildBurnup(row, agg, snapshots, today),
   };
}

const EMPTY_AGG = (): Agg => ({ scope: 0, started: 0, completed: 0, items: [] });

/**
 * Snapshots por ciclo: a série inteira só para `fullIds` (quem desenha burn-up); para
 * os demais, só o PRIMEIRO (base do `scopeDelta`) — `DISTINCT ON` no SQL (#36).
 */
async function snapshotsByCycle(
   db: Db,
   cycleIds: string[],
   fullIds: readonly string[] = cycleIds
): Promise<Map<string, SnapshotRow[]>> {
   const result = new Map<string, SnapshotRow[]>();
   if (cycleIds.length === 0) return result;
   const full = new Set(fullIds);
   const firstOnly = cycleIds.filter((id) => !full.has(id));
   const [fullRows, firstRows] = await Promise.all([
      full.size
         ? db
              .select()
              .from(snapshotT)
              .where(inArray(snapshotT.cycleId, [...full]))
              .orderBy(asc(snapshotT.date))
         : Promise.resolve([] as SnapshotRow[]),
      firstOnly.length
         ? db
              .selectDistinctOn([snapshotT.cycleId])
              .from(snapshotT)
              .where(inArray(snapshotT.cycleId, firstOnly))
              .orderBy(asc(snapshotT.cycleId), asc(snapshotT.date))
         : Promise.resolve([] as SnapshotRow[]),
   ]);
   for (const r of [...fullRows, ...firstRows]) {
      const arr = result.get(r.cycleId) ?? [];
      arr.push(r);
      result.set(r.cycleId, arr);
   }
   return result;
}

/**
 * Upsert idempotente do snapshot do DIA (1 linha por cycle+data; repetir no mesmo dia
 * só atualiza os valores, e só se MUDARAM — `IS DISTINCT FROM`). Chamado para os cycles
 * `current` no rollover (housekeeping do boot) — não há job, e o GET não escreve (#36).
 */
async function upsertSnapshots(
   db: Db,
   entries: { cycleId: string; agg: Agg }[],
   date: string
): Promise<void> {
   if (entries.length === 0) return;
   await db
      .insert(snapshotT)
      .values(
         entries.map(({ cycleId, agg }) => ({
            cycleId,
            date,
            scope: agg.scope,
            started: agg.started,
            completed: agg.completed,
         }))
      )
      .onConflictDoUpdate({
         target: [snapshotT.cycleId, snapshotT.date],
         set: {
            scope: sql`excluded.scope`,
            started: sql`excluded.started`,
            completed: sql`excluded.completed`,
         },
         where: sql`
            ${snapshotT.scope} IS DISTINCT FROM excluded.scope OR
            ${snapshotT.started} IS DISTINCT FROM excluded.started OR
            ${snapshotT.completed} IS DISTINCT FROM excluded.completed
         `,
      });
}

/** Snapshot do dia de todos os cycles `current` do time. */
export async function snapshotCurrentCycles(
   db: Db,
   teamId: string,
   now: Date = new Date()
): Promise<void> {
   const rows = await db
      .select({ id: cycleT.id })
      .from(cycleT)
      .where(and(eq(cycleT.teamId, teamId), eq(cycleT.status, 'current')));
   if (rows.length === 0) return;
   const ids = rows.map((r) => r.id);
   const aggs = await aggregatesByCycle(db, ids);
   await upsertSnapshots(
      db,
      ids.map((cycleId) => ({ cycleId, agg: aggs.get(cycleId) ?? EMPTY_AGG() })),
      workspaceDay(now)
   );
}

/**
 * Aggregates + snapshots em poucas queries para N cycles, e monta os DTOs. `burnupIds`
 * restringe quem ganha burn-up (e, portanto, quem precisa de marcos e série completa);
 * os demais saem com `burnup: null`.
 */
async function toDtos(
   db: Db,
   rows: CycleRow[],
   now: Date,
   burnupIds: readonly string[] = rows.map((r) => r.id)
): Promise<CycleDto[]> {
   const ids = rows.map((r) => r.id);
   const [aggs, snaps] = await Promise.all([
      aggregatesByCycle(db, ids, burnupIds),
      snapshotsByCycle(db, ids, burnupIds),
   ]);
   const today = workspaceDay(now);
   const withBurnup = new Set(burnupIds);
   return rows.map((r) => {
      const dto = toDto(r, aggs.get(r.id) ?? EMPTY_AGG(), snaps.get(r.id) ?? [], today);
      if (!withBurnup.has(r.id)) dto.burnup = null;
      return dto;
   });
}

/**
 * Auto-rollover (#24): quando o cycle 'current' de um time vence (endDate < hoje),
 * fecha ele, carrega as issues INCOMPLETAS (não completed/canceled) pro próximo
 * 'upcoming' — criado aqui se não existir, começando em `fim do anterior + cool-down`
 * do time (`team.cycle_cooldown_days`) e com a mesma duração — e promove o próximo a
 * 'current' quando a data de início chega. Durante o cool-down NENHUM cycle é
 * current (paridade Linear). Idempotente e lazy (rodado no boot da página e ao listar
 * os cycles do time; o app não tem scheduler). `now` é injetável para os testes.
 *
 * Transacional com lock no cycle current: dois boots concorrentes no mesmo time não
 * criam o próximo cycle em dobro (o 2º espera o lock e já vê o current fechado).
 */
export async function rolloverCyclesForTeam(
   db: Db,
   teamId: string,
   now: Date = new Date()
): Promise<void> {
   const today = workspaceDay(now);
   // O que mudou, para publicar DEPOIS do commit (#20): antes o rollover era silencioso
   // (issues trocavam de ciclo sem evento) e o `cycle/created` saía de dentro da transação.
   const touched = { created: null as string | null, updated: new Set<string>(), movedIssues: 0 };
   await db.transaction(async (tx) => {
      const [current] = await tx
         .select()
         .from(cycleT)
         .where(and(eq(cycleT.teamId, teamId), eq(cycleT.status, 'current')))
         .limit(1)
         .for('update');

      if (current && current.endDate < today) {
         let [next] = await tx
            .select()
            .from(cycleT)
            .where(and(eq(cycleT.teamId, teamId), eq(cycleT.status, 'upcoming')))
            .orderBy(asc(cycleT.startDate))
            .limit(1);
         if (!next) {
            next = await createNextCycle(tx, teamId, current);
            touched.created = next.id;
         } else touched.updated.add(next.id);

         const statuses = await tx.select().from(statusT);
         // Paridade Linear: só issues "em aberto" (unstarted/started) rolam pro próximo ciclo.
         // Backlog, triage, completed e canceled NÃO são carregadas (a doc do Linear exclui
         // explicitamente backlog+triage, além de completed/canceled).
         const noCarry = new Set(['backlog', 'triage', 'completed', 'canceled']);
         const excludeIds = statuses.filter((s) => noCarry.has(s.category)).map((s) => s.id);
         const moved = await tx
            .update(issueT)
            .set({ cycleId: next.id, updatedAt: new Date() })
            .where(
               and(
                  eq(issueT.cycleId, current.id),
                  excludeIds.length ? notInArray(issueT.statusId, excludeIds) : sql`true`
               )
            )
            .returning({ id: issueT.id });
         touched.movedIssues = moved.length;
         await tx.update(cycleT).set({ status: 'completed' }).where(eq(cycleT.id, current.id));
         touched.updated.add(current.id);
      }

      // Sem current (recém-fechado ou cool-down que acabou): promove o upcoming cuja data
      // de início já chegou. Durante o cool-down (startDate > hoje) fica sem current.
      if (!current || current.endDate < today) {
         const [due] = await tx
            .select({ id: cycleT.id })
            .from(cycleT)
            .where(
               and(
                  eq(cycleT.teamId, teamId),
                  eq(cycleT.status, 'upcoming'),
                  sql`${cycleT.startDate} <= ${today}`
               )
            )
            .orderBy(asc(cycleT.startDate))
            .limit(1);
         if (due) {
            await tx.update(cycleT).set({ status: 'current' }).where(eq(cycleT.id, due.id));
            touched.updated.add(due.id);
         }
      }
   });
   if (touched.created) {
      touched.updated.delete(touched.created);
      publish({ entity: 'cycle', action: 'created', id: touched.created, teamId });
   }
   for (const id of touched.updated) publish({ entity: 'cycle', action: 'updated', id, teamId });
   // Issues carregadas para o próximo ciclo: um sinal coarse do time (sem id) em vez de
   // um evento por issue — o cliente re-hidrata a lista uma vez.
   if (touched.movedIssues > 0) publish({ entity: 'issue', action: 'updated', teamId });
   await snapshotCurrentCycles(db, teamId, now);
}

/** Próximo cycle após `prev`: começa em `prev.endDate + 1 + cool-down`, mesma duração. */
async function createNextCycle(tx: Tx, teamId: string, prev: CycleRow): Promise<CycleRow> {
   const [team] = await tx
      .select({ cooldown: teamT.cycleCooldownDays })
      .from(teamT)
      .where(eq(teamT.id, teamId))
      .limit(1);
   const [max] = await tx
      .select({ m: sql<number | null>`max(${cycleT.number})` })
      .from(cycleT)
      .where(eq(cycleT.teamId, teamId));
   const number = (max?.m ?? 0) + 1;
   const startDate = addDays(prev.endDate, 1 + (team?.cooldown ?? 0));
   const endDate = addDays(startDate, diffDays(prev.startDate, prev.endDate));
   const [row] = await tx
      .insert(cycleT)
      .values({
         id: randomUUID(),
         number,
         name: `Cycle ${number}`,
         teamId,
         status: 'upcoming',
         startDate,
         endDate,
         capacity: prev.capacity,
      })
      .returning();
   // Sem publish aqui: roda dentro da transação do rollover, que publica após o commit.
   return row;
}

export async function listCyclesByTeam(db: Db, teamId: string): Promise<CycleDto[]> {
   const rows = await db.select().from(cycleT).where(eq(cycleT.teamId, teamId));
   return (await toDtos(db, rows, new Date())).sort((a, b) => b.number - a.number);
}

/**
 * Cycles de VÁRIOS times de uma vez, em poucas queries no total (1 cycles + aggregate
 * + snapshots pra todos os ids), em vez de N chamadas de listCyclesByTeam (cada uma
 * re-escaneando a tabela status). Usado no bootstrap do workspace — fim do N+1.
 */
export async function listCyclesForTeams(
   db: Db,
   teamIds: string[],
   opts: { burnup?: 'all' | 'current' } = {}
): Promise<CycleDto[]> {
   if (teamIds.length === 0) return [];
   const rows = await db.select().from(cycleT).where(inArray(cycleT.teamId, teamIds));
   // `burnup: 'current'` (bootstrap): a série diária dos ciclos passados é o grosso do
   // payload e só o detalhe do ciclo a desenha — fica para `getCycle`. Sem burn-up, nem
   // os marcos das issues nem a série de snapshots desses ciclos são lidos (#36).
   const burnupIds =
      opts.burnup === 'current'
         ? rows.filter((r) => r.status === 'current').map((r) => r.id)
         : rows.map((r) => r.id);
   const dtos = await toDtos(db, rows, new Date(), burnupIds);
   return dtos.sort((a, b) => b.number - a.number);
}

/**
 * Detalhe do cycle. Só leitura (#36): o snapshot do dia é gravado no housekeeping do
 * boot (rollover), não a cada GET.
 */
export async function getCycle(
   db: Db,
   id: string,
   now: Date = new Date()
): Promise<CycleDto | null> {
   const rows = await db.select().from(cycleT).where(eq(cycleT.id, id)).limit(1);
   if (rows.length === 0) return null;
   const [dto] = await toDtos(db, rows, now);
   return dto;
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
   const [dto] = await toDtos(db, rows, new Date());
   return dto;
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

/**
 * Um único ciclo `current` por time (#35): criar/promover outro current responde 409.
 * Roda dentro da transação com lock na linha do time — dois pedidos concorrentes não
 * passam juntos. (O índice parcial no banco é a rede final.)
 */
async function assertSingleCurrent(tx: Tx, teamId: string, exceptId: string | null) {
   await tx.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, teamId)).for('update');
   const [other] = await tx
      .select({ id: cycleT.id, name: cycleT.name })
      .from(cycleT)
      .where(
         and(
            eq(cycleT.teamId, teamId),
            eq(cycleT.status, 'current'),
            exceptId ? ne(cycleT.id, exceptId) : sql`true`
         )
      )
      .limit(1);
   if (other)
      throw new ApiError(
         409,
         `O time já tem um ciclo em andamento (${other.name}). Conclua-o antes de iniciar outro.`
      );
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
         await db.transaction(async (tx) => {
            if (input.status === 'current') await assertSingleCurrent(tx, input.teamId, null);
            await tx.insert(cycleT).values({
               id,
               number,
               name: input.name,
               teamId: input.teamId,
               status: input.status ?? 'planned',
               startDate: input.startDate,
               endDate: input.endDate,
               capacity: input.capacity ?? 0,
            });
         });
         publish({ entity: 'cycle', action: 'created', id, teamId: input.teamId });
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
      await db.transaction(async (tx) => {
         if (patch.status === 'current') await assertSingleCurrent(tx, prev.teamId, id);
         await tx.update(cycleT).set(set).where(eq(cycleT.id, id));
      });
   }

   publish({ entity: 'cycle', action: 'updated', id, teamId: prev.teamId });
   return getCycle(db, id);
}

/** Desassocia as issues (cycle_id=NULL) e remove o ciclo. Retorna boolean. */
export async function deleteCycle(db: Db, id: string): Promise<boolean> {
   const existing = await db
      .select({ id: cycleT.id, teamId: cycleT.teamId })
      .from(cycleT)
      .where(eq(cycleT.id, id))
      .limit(1);
   if (existing.length === 0) return false;
   // Transacional: se o delete falhar, as issues não podem ficar desassociadas.
   await db.transaction(async (tx) => {
      await tx.update(issueT).set({ cycleId: null }).where(eq(issueT.cycleId, id));
      await tx.delete(cycleT).where(eq(cycleT.id, id));
   });
   publish({ entity: 'cycle', action: 'deleted', id, teamId: existing[0].teamId });
   return true;
}
