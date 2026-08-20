import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   initiative as initT,
   initiativeProject,
   project as projectT,
   priority as priorityT,
   health as healthT,
   status as statusT,
   appUser,
} from '@/db/schema';
import { ApiError } from './errors';
import type { UserRef } from './issues';

type InitiativeRow = typeof initT.$inferSelect;
type PriorityRow = typeof priorityT.$inferSelect;
type HealthRow = typeof healthT.$inferSelect;

export interface InitiativeDto {
   id: string;
   slug: string;
   name: string;
   description: string | null;
   icon: string | null;
   status: string;
   priority: PriorityRow;
   health: HealthRow;
   owner: UserRef | null;
   target: string | null;
   projectIds: string[];
   projectCount: number;
   completedProjectCount: number;
   createdAt: string;
}

interface Maps {
   priorities: Map<string, PriorityRow>;
   healths: Map<string, HealthRow>;
}

async function loadMaps(db: Db): Promise<Maps> {
   const [priorities, healths] = await Promise.all([
      db.select().from(priorityT),
      db.select().from(healthT),
   ]);
   return {
      priorities: new Map(priorities.map((p) => [p.id, p])),
      healths: new Map(healths.map((h) => [h.id, h])),
   };
}

/** Para um conjunto de initiatives: seus projectIds e quantos estão completos. */
async function projectsByInitiative(db: Db, initIds: string[]) {
   const links = initIds.length
      ? await db
           .select()
           .from(initiativeProject)
           .where(inArray(initiativeProject.initiativeId, initIds))
      : [];
   const projectIds = [...new Set(links.map((l) => l.projectId))];
   const [projects, statuses] = await Promise.all([
      projectIds.length
         ? db
              .select({
                 id: projectT.id,
                 statusId: projectT.statusId,
                 percentComplete: projectT.percentComplete,
              })
              .from(projectT)
              .where(inArray(projectT.id, projectIds))
         : Promise.resolve([]),
      db.select().from(statusT),
   ]);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));
   const isCompleted = new Map(
      projects.map((p) => [
         p.id,
         catById.get(p.statusId) === 'completed' || p.percentComplete >= 100,
      ])
   );

   const byInit = new Map<string, { ids: string[]; completed: number }>();
   for (const id of initIds) byInit.set(id, { ids: [], completed: 0 });
   for (const link of links) {
      const e = byInit.get(link.initiativeId);
      if (!e) continue;
      e.ids.push(link.projectId);
      if (isCompleted.get(link.projectId)) e.completed += 1;
   }
   return byInit;
}

async function assemble(db: Db, rows: InitiativeRow[], maps: Maps): Promise<InitiativeDto[]> {
   if (rows.length === 0) return [];
   const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter(Boolean) as string[])];
   const [owners, projMap] = await Promise.all([
      ownerIds.length
         ? db.select().from(appUser).where(inArray(appUser.id, ownerIds))
         : Promise.resolve([]),
      projectsByInitiative(
         db,
         rows.map((r) => r.id)
      ),
   ]);
   const ownerMap = new Map(owners.map((u) => [u.id, u]));

   return rows.map((r) => {
      const owner = r.ownerId ? ownerMap.get(r.ownerId) : undefined;
      const p = projMap.get(r.id) ?? { ids: [], completed: 0 };
      return {
         id: r.id,
         slug: r.slug,
         name: r.name,
         description: r.description,
         icon: r.icon,
         status: r.status,
         priority: maps.priorities.get(r.priorityId)!,
         health: maps.healths.get(r.healthId)!,
         owner: owner
            ? {
                 id: owner.id,
                 slug: owner.slug,
                 name: owner.name,
                 email: owner.email,
                 avatarUrl: owner.avatarUrl,
              }
            : null,
         target: r.target,
         projectIds: p.ids,
         projectCount: p.ids.length,
         completedProjectCount: p.completed,
         createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
   });
}

export interface ListInitiativesOptions {
   status?: string[];
   priority?: string[];
   owner?: string[];
   health?: string[];
}

export async function listInitiatives(
   db: Db,
   opts: ListInitiativesOptions = {}
): Promise<InitiativeDto[]> {
   const maps = await loadMaps(db);
   const rows = await db.select().from(initT);
   let dtos = await assemble(db, rows, maps);
   if (opts.status?.length) dtos = dtos.filter((d) => opts.status!.includes(d.status));
   if (opts.priority?.length) dtos = dtos.filter((d) => opts.priority!.includes(d.priority.id));
   if (opts.health?.length) dtos = dtos.filter((d) => opts.health!.includes(d.health.id));
   if (opts.owner?.length) dtos = dtos.filter((d) => d.owner && opts.owner!.includes(d.owner.id));
   return dtos.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInitiative(db: Db, id: string): Promise<InitiativeDto | null> {
   const maps = await loadMaps(db);
   const rows = await db.select().from(initT).where(eq(initT.id, id)).limit(1);
   if (rows.length === 0) return null;
   return (await assemble(db, rows, maps))[0];
}

export interface CreateInitiativeInput {
   slug: string;
   name: string;
   priorityId: string;
   healthId: string;
   status?: string;
   description?: string | null;
   icon?: string | null;
   ownerId?: string | null;
   target?: string | null;
   projectIds?: string[];
}

export async function createInitiative(
   db: Db,
   input: CreateInitiativeInput
): Promise<InitiativeDto> {
   if (!input.name?.trim() || !input.slug?.trim())
      throw new ApiError(400, 'slug e name são obrigatórios');
   const maps = await loadMaps(db);
   if (!maps.priorities.has(input.priorityId))
      throw new ApiError(400, `priority '${input.priorityId}' inválido`);
   if (!maps.healths.has(input.healthId))
      throw new ApiError(400, `health '${input.healthId}' inválido`);
   const id = randomUUID();
   await db.transaction(async (tx) => {
      await tx.insert(initT).values({
         id,
         slug: input.slug,
         name: input.name,
         description: input.description ?? null,
         icon: input.icon ?? null,
         status: input.status ?? 'planned',
         priorityId: input.priorityId,
         ownerId: input.ownerId ?? null,
         target: input.target ?? null,
         healthId: input.healthId,
         createdAt: new Date(),
      });
      if (input.projectIds?.length) {
         await tx
            .insert(initiativeProject)
            .values(input.projectIds.map((projectId) => ({ initiativeId: id, projectId })))
            .onConflictDoNothing();
         // Mantém project.initiativeId em sincronia com a tabela de vínculo.
         await tx
            .update(projectT)
            .set({ initiativeId: id })
            .where(inArray(projectT.id, input.projectIds));
      }
   });
   return (await getInitiative(db, id))!;
}

export interface UpdateInitiativeInput {
   name?: string;
   description?: string | null;
   icon?: string | null;
   status?: string;
   priorityId?: string;
   healthId?: string;
   ownerId?: string | null;
   target?: string | null;
   projectIds?: string[];
}

export async function updateInitiative(
   db: Db,
   id: string,
   patch: UpdateInitiativeInput
): Promise<InitiativeDto | null> {
   const existing = await db.select({ id: initT.id }).from(initT).where(eq(initT.id, id)).limit(1);
   if (existing.length === 0) return null;
   const set: Record<string, unknown> = {};
   for (const k of [
      'name',
      'description',
      'icon',
      'status',
      'priorityId',
      'healthId',
      'ownerId',
      'target',
   ] as const) {
      if (patch[k] !== undefined) set[k] = patch[k];
   }
   await db.transaction(async (tx) => {
      if (Object.keys(set).length) await tx.update(initT).set(set).where(eq(initT.id, id));
      // Reconciliação initiative↔project: substitui o conjunto de vínculos e
      // mantém project.initiativeId dos dois lados sempre consistente.
      if (patch.projectIds !== undefined) {
         const old = await tx
            .select({ projectId: initiativeProject.projectId })
            .from(initiativeProject)
            .where(eq(initiativeProject.initiativeId, id));
         const oldIds = old.map((l) => l.projectId);
         await tx.delete(initiativeProject).where(eq(initiativeProject.initiativeId, id));
         // Limpa a back-reference dos projetos que apontavam para esta initiative.
         if (oldIds.length) {
            await tx
               .update(projectT)
               .set({ initiativeId: null })
               .where(and(inArray(projectT.id, oldIds), eq(projectT.initiativeId, id)));
         }
         if (patch.projectIds.length) {
            await tx
               .insert(initiativeProject)
               .values(patch.projectIds.map((projectId) => ({ initiativeId: id, projectId })))
               .onConflictDoNothing();
            await tx
               .update(projectT)
               .set({ initiativeId: id })
               .where(inArray(projectT.id, patch.projectIds));
         }
      }
   });
   return getInitiative(db, id);
}

export async function deleteInitiative(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: initT.id }).from(initT).where(eq(initT.id, id)).limit(1);
   if (existing.length === 0) return false;
   await db.transaction(async (tx) => {
      await tx.delete(initiativeProject).where(eq(initiativeProject.initiativeId, id));
      // project.initiativeId é RESTRICT e nullable: desvincula os projetos antes de deletar.
      await tx.update(projectT).set({ initiativeId: null }).where(eq(projectT.initiativeId, id));
      await tx.delete(initT).where(eq(initT.id, id));
   });
   return true;
}

export async function getInitiativeProjects(db: Db, id: string): Promise<string[]> {
   const links = await db
      .select({ projectId: initiativeProject.projectId })
      .from(initiativeProject)
      .where(eq(initiativeProject.initiativeId, id));
   return links.map((l) => l.projectId);
}
