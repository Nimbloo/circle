import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   initiative as initT,
   project as projectT,
   priority as priorityT,
   health as healthT,
   status as statusT,
   appUser,
} from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
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
   // Fonte única: project.initiativeId (a join table initiative_project foi removida).
   const projects = initIds.length
      ? await db
           .select({
              id: projectT.id,
              initiativeId: projectT.initiativeId,
              statusId: projectT.statusId,
              percentComplete: projectT.percentComplete,
           })
           .from(projectT)
           .where(inArray(projectT.initiativeId, initIds))
      : [];
   const statuses = await db.select().from(statusT);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));

   const byInit = new Map<string, { ids: string[]; completed: number }>();
   for (const id of initIds) byInit.set(id, { ids: [], completed: 0 });
   for (const p of projects) {
      if (!p.initiativeId) continue;
      const e = byInit.get(p.initiativeId);
      if (!e) continue;
      e.ids.push(p.id);
      if (catById.get(p.statusId) === 'completed' || p.percentComplete >= 100) e.completed += 1;
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
   // Filtros empurrados pro SQL (colunas diretas da initiative) + ordenação no banco,
   // em vez de carregar tudo e filtrar/ordenar em JS.
   const conds = [];
   if (opts.status?.length) conds.push(inArray(initT.status, opts.status));
   if (opts.priority?.length) conds.push(inArray(initT.priorityId, opts.priority));
   if (opts.health?.length) conds.push(inArray(initT.healthId, opts.health));
   if (opts.owner?.length) conds.push(inArray(initT.ownerId, opts.owner));
   const rows = await db
      .select()
      .from(initT)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(initT.name));
   return assemble(db, rows, maps);
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
         // Fonte única: só o back-ref no projeto (a join table foi removida).
         await tx
            .update(projectT)
            .set({ initiativeId: id })
            .where(inArray(projectT.id, input.projectIds));
      }
   });
   publish({ entity: 'initiative', action: 'created', id });
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
      // Reconciliação initiative↔project na fonte única (project.initiativeId):
      // solta todos os projetos que apontavam para esta initiative e re-vincula o novo conjunto.
      if (patch.projectIds !== undefined) {
         await tx.update(projectT).set({ initiativeId: null }).where(eq(projectT.initiativeId, id));
         if (patch.projectIds.length) {
            await tx
               .update(projectT)
               .set({ initiativeId: id })
               .where(inArray(projectT.id, patch.projectIds));
         }
      }
   });
   publish({ entity: 'initiative', action: 'updated', id });
   return getInitiative(db, id);
}

export async function deleteInitiative(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: initT.id }).from(initT).where(eq(initT.id, id)).limit(1);
   if (existing.length === 0) return false;
   await db.transaction(async (tx) => {
      // project.initiativeId é nullable: desvincula os projetos antes de deletar.
      await tx.update(projectT).set({ initiativeId: null }).where(eq(projectT.initiativeId, id));
      await tx.delete(initT).where(eq(initT.id, id));
   });
   publish({ entity: 'initiative', action: 'deleted', id });
   return true;
}
