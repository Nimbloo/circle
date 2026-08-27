import { randomUUID } from 'node:crypto';
import { eq, inArray, notInArray, count, and, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   project as projectT,
   team as teamT,
   projectLabel,
   projectUpdate,
   projectActivity,
   projectMilestone,
   projectResource,
   projectDetail,
   issue as issueT,
   status as statusT,
   priority as priorityT,
   health as healthT,
   label as labelT,
   appUser,
} from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
import { getOrCreateUser } from './users';
import type { UserRef } from './issues';

type ProjectRow = typeof projectT.$inferSelect;
type StatusRow = typeof statusT.$inferSelect;
type PriorityRow = typeof priorityT.$inferSelect;
type HealthRow = typeof healthT.$inferSelect;
type LabelRow = typeof labelT.$inferSelect;

export interface ProjectDto {
   id: string;
   name: string;
   status: StatusRow;
   priority: PriorityRow;
   health: HealthRow;
   percentComplete: number;
   startDate: string | null;
   targetDate: string | null;
   lead: UserRef | null;
   teamId: string;
   initiativeId: string | null;
   labels: LabelRow[];
   healthUpdatedAt: string | null;
   healthUpdatedAgoDays: number | null;
   issueCount: number;
}

interface Maps {
   statuses: Map<string, StatusRow>;
   priorities: Map<string, PriorityRow>;
   healths: Map<string, HealthRow>;
   labels: Map<string, LabelRow>;
}

async function loadMaps(db: Db): Promise<Maps> {
   const [statuses, priorities, healths, labels] = await Promise.all([
      db.select().from(statusT),
      db.select().from(priorityT),
      db.select().from(healthT),
      db.select().from(labelT),
   ]);
   return {
      statuses: new Map(statuses.map((s) => [s.id, s])),
      priorities: new Map(priorities.map((p) => [p.id, p])),
      healths: new Map(healths.map((h) => [h.id, h])),
      labels: new Map(labels.map((l) => [l.id, l])),
   };
}

function daysSince(ts: Date | string | null): number | null {
   if (!ts) return null;
   const d = ts instanceof Date ? ts : new Date(ts);
   return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

async function assemble(db: Db, rows: ProjectRow[], maps: Maps): Promise<ProjectDto[]> {
   if (rows.length === 0) return [];
   const ids = rows.map((r) => r.id);
   const leadIds = [...new Set(rows.map((r) => r.leadId).filter(Boolean) as string[])];

   // IDs dos status "concluído" (para o % de conclusão real, derivado das issues).
   const completedStatusIds = [...maps.statuses.values()]
      .filter((s) => s.category === 'completed')
      .map((s) => s.id);

   const teamIds = [...new Set(rows.map((r) => r.teamId))];
   const pts = sql<number>`coalesce(sum(coalesce(${issueT.estimate}, 1)), 0)`;
   const [leads, labelLinks, issueCounts, completedCounts, estimateSums, completedEstimateSums, teams] =
      await Promise.all([
         leadIds.length
            ? db.select().from(appUser).where(inArray(appUser.id, leadIds))
            : Promise.resolve([]),
         db.select().from(projectLabel).where(inArray(projectLabel.projectId, ids)),
         db
            .select({ projectId: issueT.projectId, n: count() })
            .from(issueT)
            .where(inArray(issueT.projectId, ids))
            .groupBy(issueT.projectId),
         completedStatusIds.length
            ? db
                 .select({ projectId: issueT.projectId, n: count() })
                 .from(issueT)
                 .where(
                    and(inArray(issueT.projectId, ids), inArray(issueT.statusId, completedStatusIds))
                 )
                 .groupBy(issueT.projectId)
            : Promise.resolve([]),
         db
            .select({ projectId: issueT.projectId, n: pts })
            .from(issueT)
            .where(inArray(issueT.projectId, ids))
            .groupBy(issueT.projectId),
         completedStatusIds.length
            ? db
                 .select({ projectId: issueT.projectId, n: pts })
                 .from(issueT)
                 .where(
                    and(inArray(issueT.projectId, ids), inArray(issueT.statusId, completedStatusIds))
                 )
                 .groupBy(issueT.projectId)
            : Promise.resolve([]),
         db
            .select({ id: teamT.id, estimatesEnabled: teamT.estimatesEnabled })
            .from(teamT)
            .where(inArray(teamT.id, teamIds)),
      ]);
   const leadMap = new Map(leads.map((u) => [u.id, u]));
   const countMap = new Map(issueCounts.map((r) => [r.projectId, Number(r.n)]));
   const completedMap = new Map(completedCounts.map((r) => [r.projectId, Number(r.n)]));
   const ptsMap = new Map(estimateSums.map((r) => [r.projectId, Number(r.n)]));
   const completedPtsMap = new Map(completedEstimateSums.map((r) => [r.projectId, Number(r.n)]));
   const estimateTeams = new Set(teams.filter((t) => t.estimatesEnabled).map((t) => t.id));
   const labelsByProject = new Map<string, LabelRow[]>();
   for (const link of labelLinks) {
      const lbl = maps.labels.get(link.labelId);
      if (!lbl) continue;
      const arr = labelsByProject.get(link.projectId) ?? [];
      arr.push(lbl);
      labelsByProject.set(link.projectId, arr);
   }

   return rows.map((r) => {
      const lead = r.leadId ? leadMap.get(r.leadId) : undefined;
      const ht = r.healthUpdatedAt;
      // % de conclusão REAL derivado das issues (done/total). Sem issues, cai no
      // campo estático do projeto. Calculado no servidor → o cliente não re-escaneia
      // todas as issues por linha (era O(P·N) por mutação de issue).
      // Progresso por pontos (soma de estimate; sem estimate = 1) quando o time tem
      // estimates ligados; senão por contagem de issues.
      const byEstimate = estimateTeams.has(r.teamId);
      const total = byEstimate ? (ptsMap.get(r.id) ?? 0) : (countMap.get(r.id) ?? 0);
      const done = byEstimate ? (completedPtsMap.get(r.id) ?? 0) : (completedMap.get(r.id) ?? 0);
      const pct = total > 0 ? Math.round((done / total) * 100) : r.percentComplete;
      return {
         id: r.id,
         name: r.name,
         status: maps.statuses.get(r.statusId)!,
         priority: maps.priorities.get(r.priorityId)!,
         health: maps.healths.get(r.healthId)!,
         percentComplete: pct,
         startDate: r.startDate,
         targetDate: r.targetDate,
         lead: lead
            ? {
                 id: lead.id,
                 slug: lead.slug,
                 name: lead.name,
                 email: lead.email,
                 avatarUrl: lead.avatarUrl,
              }
            : null,
         teamId: r.teamId,
         initiativeId: r.initiativeId,
         labels: labelsByProject.get(r.id) ?? [],
         healthUpdatedAt: ht instanceof Date ? ht.toISOString() : (ht as string | null),
         healthUpdatedAgoDays: daysSince(ht),
         issueCount: countMap.get(r.id) ?? 0,
      };
   });
}

export type ProjectSort = 'title' | 'start-date' | 'target-date' | 'status';

export interface ListProjectsOptions {
   tab?: 'all' | 'active';
   health?: string[];
   priority?: string[];
   team?: string;
   initiative?: string;
   includeClosed?: boolean;
   sort?: ProjectSort;
   dir?: 'asc' | 'desc';
}

const CLOSED_CATEGORIES = new Set(['completed', 'canceled']);

export async function listProjects(db: Db, opts: ListProjectsOptions = {}): Promise<ProjectDto[]> {
   const maps = await loadMaps(db);
   // Filtros empurrados pro SQL (colunas diretas + categoria closed via catálogo),
   // em vez de carregar todos os projetos e filtrar em JS.
   const conds = [];
   if (opts.health?.length) conds.push(inArray(projectT.healthId, opts.health));
   if (opts.priority?.length) conds.push(inArray(projectT.priorityId, opts.priority));
   if (opts.team) conds.push(eq(projectT.teamId, opts.team));
   if (opts.initiative) conds.push(eq(projectT.initiativeId, opts.initiative));
   if (opts.tab === 'active' || opts.includeClosed === false) {
      const closedIds = [...maps.statuses.values()]
         .filter((s) => CLOSED_CATEGORIES.has(s.category))
         .map((s) => s.id);
      if (closedIds.length) conds.push(notInArray(projectT.statusId, closedIds));
   }
   const rows = await db
      .select()
      .from(projectT)
      .where(conds.length ? and(...conds) : undefined);
   const dtos = await assemble(db, rows, maps);

   // Ordenação em JS: 'status' usa status.position (catálogo já montado no dto).
   const dir = opts.dir === 'desc' ? -1 : 1;
   const by = opts.sort ?? 'title';
   dtos.sort((a, b) => {
      let cmp = 0;
      if (by === 'start-date') cmp = (a.startDate ?? '').localeCompare(b.startDate ?? '');
      else if (by === 'target-date') cmp = (a.targetDate ?? '').localeCompare(b.targetDate ?? '');
      else if (by === 'status') cmp = a.status.position - b.status.position;
      else cmp = a.name.localeCompare(b.name);
      return cmp * dir;
   });
   return dtos;
}

export async function getProject(db: Db, id: string): Promise<ProjectDto | null> {
   const maps = await loadMaps(db);
   const rows = await db.select().from(projectT).where(eq(projectT.id, id)).limit(1);
   if (rows.length === 0) return null;
   return (await assemble(db, rows, maps))[0];
}

export interface CreateProjectInput {
   name: string;
   statusId: string;
   priorityId: string;
   healthId: string;
   teamId: string;
   leadId?: string | null;
   percentComplete?: number;
   startDate?: string | null;
   targetDate?: string | null;
   initiativeId?: string | null;
   labelIds?: string[];
}

export async function createProject(db: Db, input: CreateProjectInput): Promise<ProjectDto> {
   if (!input.name?.trim()) throw new ApiError(400, 'name é obrigatório');
   const maps = await loadMaps(db);
   if (!maps.statuses.has(input.statusId))
      throw new ApiError(400, `status '${input.statusId}' inválido`);
   if (!maps.priorities.has(input.priorityId))
      throw new ApiError(400, `priority '${input.priorityId}' inválido`);
   if (!maps.healths.has(input.healthId))
      throw new ApiError(400, `health '${input.healthId}' inválido`);
   const id = randomUUID();
   const now = new Date();
   await db.transaction(async (tx) => {
      await tx.insert(projectT).values({
         id,
         name: input.name,
         statusId: input.statusId,
         priorityId: input.priorityId,
         healthId: input.healthId,
         teamId: input.teamId,
         leadId: input.leadId ?? null,
         percentComplete: input.percentComplete ?? 0,
         startDate: input.startDate ?? null,
         targetDate: input.targetDate ?? null,
         initiativeId: input.initiativeId ?? null,
         healthUpdatedAt: null,
         createdAt: now,
         updatedAt: now,
      });
      if (input.labelIds?.length) {
         await tx
            .insert(projectLabel)
            .values(input.labelIds.map((labelId) => ({ projectId: id, labelId })))
            .onConflictDoNothing();
      }
   });
   publish({ entity: 'project', action: 'created', id });
   return (await getProject(db, id))!;
}

export interface UpdateProjectInput {
   name?: string;
   statusId?: string;
   priorityId?: string;
   healthId?: string;
   leadId?: string | null;
   percentComplete?: number;
   startDate?: string | null;
   targetDate?: string | null;
   initiativeId?: string | null;
}

/** Rótulos legíveis dos campos, para o feed de atividade do projeto. */
const PROJECT_FIELD_LABELS: Partial<Record<keyof UpdateProjectInput, string>> = {
   name: 'name',
   statusId: 'status',
   priorityId: 'priority',
   healthId: 'health',
   leadId: 'lead',
   startDate: 'start date',
   targetDate: 'target date',
   initiativeId: 'initiative',
};

export async function updateProject(
   db: Db,
   id: string,
   patch: UpdateProjectInput,
   actorEmail?: string
): Promise<ProjectDto | null> {
   const existing = await db
      .select({ id: projectT.id, healthId: projectT.healthId })
      .from(projectT)
      .where(eq(projectT.id, id))
      .limit(1);
   if (existing.length === 0) return null;
   const set: Record<string, unknown> = { updatedAt: new Date() };
   for (const k of [
      'name',
      'statusId',
      'priorityId',
      'healthId',
      'leadId',
      'percentComplete',
      'startDate',
      'targetDate',
      'initiativeId',
   ] as const) {
      if (patch[k] !== undefined) set[k] = patch[k];
   }
   if (patch.healthId !== undefined && patch.healthId !== existing[0].healthId)
      set.healthUpdatedAt = new Date();
   await db.transaction(async (tx) => {
      await tx.update(projectT).set(set).where(eq(projectT.id, id));

      // Feed de atividade (Linear loga toda mudança). Uma linha por update, resumindo
      // os campos alterados. Sem actor conhecido, não loga.
      if (actorEmail) {
         const changed = (Object.keys(patch) as (keyof UpdateProjectInput)[])
            .filter((k) => patch[k] !== undefined && PROJECT_FIELD_LABELS[k])
            .map((k) => PROJECT_FIELD_LABELS[k]);
         if (changed.length > 0) {
            const actor = await getOrCreateUser(db, actorEmail);
            await tx.insert(projectActivity).values({
               id: randomUUID(),
               projectId: id,
               userId: actor.id,
               text: `changed ${changed.join(', ')}`,
               createdAt: new Date(),
            });
         }
      }
   });
   publish({ entity: 'project', action: 'updated', id });
   return getProject(db, id);
}

export async function deleteProject(db: Db, id: string): Promise<boolean> {
   const existing = await db
      .select({ id: projectT.id })
      .from(projectT)
      .where(eq(projectT.id, id))
      .limit(1);
   if (existing.length === 0) return false;
   await db.transaction(async (tx) => {
      // issue.projectId é RESTRICT e nullable: desvincula em vez de deletar as issues.
      await tx.update(issueT).set({ projectId: null }).where(eq(issueT.projectId, id));
      await tx.delete(projectLabel).where(eq(projectLabel.projectId, id));
      await tx.delete(projectUpdate).where(eq(projectUpdate.projectId, id));
      await tx.delete(projectActivity).where(eq(projectActivity.projectId, id));
      await tx.delete(projectMilestone).where(eq(projectMilestone.projectId, id));
      await tx.delete(projectResource).where(eq(projectResource.projectId, id));
      await tx.delete(projectDetail).where(eq(projectDetail.projectId, id));
      await tx.delete(projectT).where(eq(projectT.id, id));
   });
   publish({ entity: 'project', action: 'deleted', id });
   return true;
}
