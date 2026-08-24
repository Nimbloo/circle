import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   issue as issueT,
   status as statusT,
   appUser,
   issueLabel,
   cycle as cycleT,
} from '@/db/schema';

/** Progresso de um projeto: scope/started/completed/% + breakdowns por assignee/label/cycle. */
export interface Breakdown {
   key: string;
   label: string;
   total: number;
   completed: number;
   completedPercent: number;
}
export interface ProjectProgress {
   scope: number;
   started: number;
   completed: number;
   percentComplete: number;
   byAssignee: Breakdown[];
   byLabel: Breakdown[];
   byCycle: Breakdown[];
}

export async function projectProgress(db: Db, projectId: string): Promise<ProjectProgress | null> {
   const issues = await db
      .select({
         id: issueT.id,
         statusId: issueT.statusId,
         assigneeId: issueT.assigneeId,
         cycleId: issueT.cycleId,
      })
      .from(issueT)
      .where(eq(issueT.projectId, projectId));
   const statuses = await db.select().from(statusT);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));

   const isCompleted = (statusId: string) => catById.get(statusId) === 'completed';
   const isStarted = (statusId: string) => catById.get(statusId) === 'started';

   const scope = issues.length;
   const started = issues.filter((i) => isStarted(i.statusId)).length;
   const completed = issues.filter((i) => isCompleted(i.statusId)).length;
   const percentComplete = scope > 0 ? Math.round((completed / scope) * 100) : 0;

   // labels das issues do projeto
   const issueIds = issues.map((i) => i.id);
   const labelLinks = issueIds.length
      ? await db.select().from(issueLabel).where(inArray(issueLabel.issueId, issueIds))
      : [];
   const labelByIssue = new Map<string, string[]>();
   for (const l of labelLinks) {
      const arr = labelByIssue.get(l.issueId) ?? [];
      arr.push(l.labelId);
      labelByIssue.set(l.issueId, arr);
   }

   const assigneeIds = [...new Set(issues.map((i) => i.assigneeId).filter(Boolean) as string[])];
   const cycleIds = [...new Set(issues.map((i) => i.cycleId).filter(Boolean) as string[])];
   const [users, cycles] = await Promise.all([
      assigneeIds.length
         ? db
              .select({ id: appUser.id, name: appUser.name })
              .from(appUser)
              .where(inArray(appUser.id, assigneeIds))
         : Promise.resolve([]),
      cycleIds.length
         ? db
              .select({ id: cycleT.id, name: cycleT.name })
              .from(cycleT)
              .where(inArray(cycleT.id, cycleIds))
         : Promise.resolve([]),
   ]);
   const userName = new Map(users.map((u) => [u.id, u.name]));
   const cycleName = new Map(cycles.map((c) => [c.id, c.name]));

   const bucket = (
      keyOf: (i: (typeof issues)[number]) => string | null,
      labelOf: (k: string) => string
   ): Breakdown[] => {
      const m = new Map<string, { total: number; completed: number }>();
      for (const i of issues) {
         const k = keyOf(i);
         if (k === null) continue;
         const e = m.get(k) ?? { total: 0, completed: 0 };
         e.total += 1;
         if (isCompleted(i.statusId)) e.completed += 1;
         m.set(k, e);
      }
      return [...m.entries()]
         .map(([key, v]) => ({
            key,
            label: labelOf(key),
            total: v.total,
            completed: v.completed,
            completedPercent: v.total ? Math.round((v.completed / v.total) * 100) : 0,
         }))
         .sort((a, b) => b.total - a.total);
   };

   const byAssignee = bucket(
      (i) => i.assigneeId ?? 'unassigned',
      (k) => (k === 'unassigned' ? 'Unassigned' : (userName.get(k) ?? k))
   );
   const byCycle = bucket(
      (i) => i.cycleId ?? null,
      (k) => cycleName.get(k) ?? k
   );

   // por label (primeiro label da issue, como no mock)
   const byLabelMap = new Map<string, { total: number; completed: number }>();
   for (const i of issues) {
      const first = labelByIssue.get(i.id)?.[0];
      if (!first) continue;
      const e = byLabelMap.get(first) ?? { total: 0, completed: 0 };
      e.total += 1;
      if (isCompleted(i.statusId)) e.completed += 1;
      byLabelMap.set(first, e);
   }
   const byLabel = [...byLabelMap.entries()]
      .map(([key, v]) => ({
         key,
         label: key,
         total: v.total,
         completed: v.completed,
         completedPercent: v.total ? Math.round((v.completed / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

   return { scope, started, completed, percentComplete, byAssignee, byLabel, byCycle };
}
