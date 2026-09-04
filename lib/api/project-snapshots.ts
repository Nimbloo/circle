/**
 * Histórico de progresso do projeto (#102).
 *
 * Uma linha por (projeto, dia) com scope/started/completed em NÚMERO DE ISSUES —
 * a mesma base do `percentComplete` do `ProjectDto` (done/total), não os pontos de
 * estimate usados pelo burn-up do cycle.
 *
 * Sem job: o dia é gravado (upsert idempotente, mesmo padrão de `cycle_snapshot`) no
 * boot do workspace, no GET do roadmap e no GET da própria série. Dois writers
 * concorrentes no mesmo dia convergem — o `ON CONFLICT DO UPDATE` grava o mesmo valor.
 */
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { issue as issueT, projectSnapshot as snapshotT, status as statusT } from '@/db/schema';

export interface ProjectSnapshotPoint {
   date: string;
   scope: number;
   started: number;
   completed: number;
}

interface Agg {
   scope: number;
   started: number;
   completed: number;
}

const EMPTY_AGG = (): Agg => ({ scope: 0, started: 0, completed: 0 });

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** scope/started/completed atuais por projeto, contando issues. */
async function aggregatesByProject(db: Db, projectIds: string[]): Promise<Map<string, Agg>> {
   const result = new Map<string, Agg>();
   for (const id of projectIds) result.set(id, EMPTY_AGG());
   if (projectIds.length === 0) return result;

   const [issues, statuses] = await Promise.all([
      db
         .select({ projectId: issueT.projectId, statusId: issueT.statusId })
         .from(issueT)
         .where(inArray(issueT.projectId, projectIds)),
      db.select({ id: statusT.id, category: statusT.category }).from(statusT),
   ]);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));
   for (const row of issues) {
      if (!row.projectId) continue;
      const agg = result.get(row.projectId);
      if (!agg) continue;
      agg.scope += 1;
      const cat = catById.get(row.statusId);
      if (cat === 'started') agg.started += 1;
      else if (cat === 'completed') agg.completed += 1;
   }
   return result;
}

/**
 * Grava o snapshot do dia dos projetos pedidos (upsert idempotente). Projeto sem
 * issue nenhuma NÃO gera linha — série vazia é honesta, uma sequência de zeros não é.
 */
export async function snapshotProjects(
   db: Db,
   projectIds: readonly string[],
   now: Date = new Date()
): Promise<void> {
   const ids = [...new Set(projectIds)];
   if (ids.length === 0) return;
   const aggs = await aggregatesByProject(db, ids);
   const rows = ids
      .map((projectId) => ({ projectId, agg: aggs.get(projectId) ?? EMPTY_AGG() }))
      .filter(({ agg }) => agg.scope > 0)
      .map(({ projectId, agg }) => ({
         projectId,
         date: isoDay(now),
         scope: agg.scope,
         started: agg.started,
         completed: agg.completed,
      }));
   if (rows.length === 0) return;
   await db
      .insert(snapshotT)
      .values(rows)
      .onConflictDoUpdate({
         target: [snapshotT.projectId, snapshotT.date],
         set: {
            scope: sql`excluded.scope`,
            started: sql`excluded.started`,
            completed: sql`excluded.completed`,
         },
      });
}

/** Série gravada do projeto, do dia mais antigo para o mais novo. */
export async function listProjectSnapshots(
   db: Db,
   projectId: string
): Promise<ProjectSnapshotPoint[]> {
   const rows = await db
      .select()
      .from(snapshotT)
      .where(eq(snapshotT.projectId, projectId))
      .orderBy(asc(snapshotT.date));
   return rows.map((r) => ({
      date: r.date,
      scope: r.scope,
      started: r.started,
      completed: r.completed,
   }));
}

/**
 * Série do projeto, gravando o dia corrente antes de ler (lazy). É o que a UI chama.
 */
export async function getProjectSnapshots(
   db: Db,
   projectId: string,
   now: Date = new Date()
): Promise<ProjectSnapshotPoint[]> {
   await snapshotProjects(db, [projectId], now);
   return listProjectSnapshots(db, projectId);
}

/**
 * Soma as séries de vários projetos por dia. Um projeto sem linha naquele dia entra
 * com o ÚLTIMO valor conhecido (carry-forward) — o dado não sumiu, só não foi
 * regravado; zerar inventaria uma queda que não houve. Antes do primeiro snapshot do
 * projeto ele simplesmente não conta.
 */
export function aggregateSnapshots(series: ProjectSnapshotPoint[][]): ProjectSnapshotPoint[] {
   const days = [...new Set(series.flat().map((p) => p.date))].sort();
   if (days.length === 0) return [];
   const cursors = series.map(() => 0);
   const last: (ProjectSnapshotPoint | null)[] = series.map(() => null);

   return days.map((date) => {
      const total = { date, scope: 0, started: 0, completed: 0 };
      series.forEach((points, index) => {
         while (cursors[index] < points.length && points[cursors[index]].date <= date) {
            last[index] = points[cursors[index]];
            cursors[index] += 1;
         }
         const point = last[index];
         if (!point) return;
         total.scope += point.scope;
         total.started += point.started;
         total.completed += point.completed;
      });
      return total;
   });
}

/**
 * Série agregada de um conjunto de projetos (detalhe da initiative), gravando o dia
 * corrente de cada um antes de ler.
 */
export async function getAggregatedSnapshots(
   db: Db,
   projectIds: readonly string[],
   now: Date = new Date()
): Promise<ProjectSnapshotPoint[]> {
   const ids = [...new Set(projectIds)];
   if (ids.length === 0) return [];
   await snapshotProjects(db, ids, now);
   const rows = await db
      .select()
      .from(snapshotT)
      .where(inArray(snapshotT.projectId, ids))
      .orderBy(asc(snapshotT.date));
   const byProject = new Map<string, ProjectSnapshotPoint[]>();
   for (const r of rows) {
      const arr = byProject.get(r.projectId) ?? [];
      arr.push({ date: r.date, scope: r.scope, started: r.started, completed: r.completed });
      byProject.set(r.projectId, arr);
   }
   return aggregateSnapshots([...byProject.values()]);
}
