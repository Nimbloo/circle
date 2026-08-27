import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   project as projectT,
   projectDetail,
   projectMilestone,
   projectResource,
   projectUpdate,
   projectActivity,
   appUser,
} from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
import type { UserRef } from './issues';
import type { ContentBlock } from '@/data/issue-details';

/* -------------------------------------------------------------------------- */
/*                                    DTOs                                     */
/* -------------------------------------------------------------------------- */

export type ProjectUpdateHealth = 'on-track' | 'at-risk' | 'off-track';
export const UPDATE_HEALTHS: readonly ProjectUpdateHealth[] = ['on-track', 'at-risk', 'off-track'];

export interface ProjectMilestoneDto {
   id: string;
   name: string;
   targetDate: string | null;
   completed: boolean;
}

export interface ProjectResourceDto {
   id: string;
   label: string;
   url: string;
}

export interface ProjectUpdateDto {
   id: string;
   author: UserRef | null;
   health: ProjectUpdateHealth;
   blocks: ContentBlock[];
   createdAt: string;
}

export interface ProjectActivityDto {
   id: string;
   user: UserRef | null;
   text: string;
   createdAt: string;
}

export interface ProjectDetailDto {
   projectId: string;
   summary: string;
   description: ContentBlock[];
   milestones: ProjectMilestoneDto[];
   resources: ProjectResourceDto[];
   updates: ProjectUpdateDto[];
   activity: ProjectActivityDto[];
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

function userRef(
   u:
      | { id: string; slug: string; name: string; email: string; avatarUrl: string | null }
      | undefined
): UserRef | null {
   return u
      ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
      : null;
}

function iso(ts: Date | string | null): string {
   if (!ts) return '';
   return ts instanceof Date ? ts.toISOString() : String(ts);
}

/** Desserializa uma coluna JSON de ContentBlock[] com tolerância a lixo/nulo. */
function parseBlocks(raw: string | null): ContentBlock[] {
   if (!raw) return [];
   try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ContentBlock[]) : [];
   } catch {
      return [];
   }
}

/** Confirma que o projeto existe; lança 404 caso contrário. */
async function assertProject(db: Db, projectId: string): Promise<void> {
   const rows = await db
      .select({ id: projectT.id })
      .from(projectT)
      .where(eq(projectT.id, projectId))
      .limit(1);
   if (rows.length === 0) throw new ApiError(404, `Project '${projectId}' não encontrado`);
}

async function loadUsers(db: Db, ids: string[]) {
   const uniq = [...new Set(ids.filter(Boolean))];
   if (uniq.length === 0) return new Map<string, typeof appUser.$inferSelect>();
   const rows = await db.select().from(appUser).where(inArray(appUser.id, uniq));
   return new Map(rows.map((u) => [u.id, u]));
}

/* -------------------------------------------------------------------------- */
/*                                  Loaders                                    */
/* -------------------------------------------------------------------------- */

export async function listMilestones(db: Db, projectId: string): Promise<ProjectMilestoneDto[]> {
   const rows = await db
      .select()
      .from(projectMilestone)
      .where(eq(projectMilestone.projectId, projectId))
      .orderBy(asc(projectMilestone.targetDate), asc(projectMilestone.name));
   return rows.map((m) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate ?? null,
      completed: m.completed,
   }));
}

export async function listResources(db: Db, projectId: string): Promise<ProjectResourceDto[]> {
   const rows = await db
      .select()
      .from(projectResource)
      .where(eq(projectResource.projectId, projectId))
      .orderBy(asc(projectResource.label));
   return rows.map((r) => ({ id: r.id, label: r.label, url: r.url }));
}

export async function listUpdates(db: Db, projectId: string): Promise<ProjectUpdateDto[]> {
   const rows = await db
      .select()
      .from(projectUpdate)
      .where(eq(projectUpdate.projectId, projectId))
      .orderBy(desc(projectUpdate.createdAt));
   const users = await loadUsers(
      db,
      rows.map((r) => r.authorId)
   );
   return rows.map((r) => ({
      id: r.id,
      author: userRef(users.get(r.authorId)),
      health: (r.health as ProjectUpdateHealth) ?? 'on-track',
      blocks: parseBlocks(r.blocks),
      createdAt: iso(r.createdAt),
   }));
}

async function listActivity(db: Db, projectId: string): Promise<ProjectActivityDto[]> {
   const rows = await db
      .select()
      .from(projectActivity)
      .where(eq(projectActivity.projectId, projectId))
      .orderBy(desc(projectActivity.createdAt));
   const users = await loadUsers(
      db,
      rows.map((r) => r.userId)
   );
   return rows.map((r) => ({
      id: r.id,
      user: userRef(users.get(r.userId)),
      text: r.text,
      createdAt: iso(r.createdAt),
   }));
}

/** Detalhe editorial completo do projeto (join das 5 tabelas). null se o projeto não existir. */
export async function getProjectDetail(
   db: Db,
   projectId: string
): Promise<ProjectDetailDto | null> {
   const proj = await db
      .select({ id: projectT.id })
      .from(projectT)
      .where(eq(projectT.id, projectId))
      .limit(1);
   if (proj.length === 0) return null;

   const [detailRow, milestones, resources, updates, activity] = await Promise.all([
      db.select().from(projectDetail).where(eq(projectDetail.projectId, projectId)).limit(1),
      listMilestones(db, projectId),
      listResources(db, projectId),
      listUpdates(db, projectId),
      listActivity(db, projectId),
   ]);

   return {
      projectId,
      summary: detailRow[0]?.summary ?? '',
      description: parseBlocks(detailRow[0]?.description ?? null),
      milestones,
      resources,
      updates,
      activity,
   };
}

/* -------------------------------------------------------------------------- */
/*                                  Mutations                                  */
/* -------------------------------------------------------------------------- */

export interface UpdateDetailInput {
   summary?: string | null;
   description?: ContentBlock[] | null;
}

/** Upsert do summary/description em project_detail. Retorna o detalhe completo. */
export async function updateProjectDetail(
   db: Db,
   projectId: string,
   patch: UpdateDetailInput
): Promise<ProjectDetailDto | null> {
   await assertProject(db, projectId);

   const set: { summary?: string | null; description?: string | null } = {};
   if (patch.summary !== undefined) set.summary = patch.summary;
   if (patch.description !== undefined)
      set.description = patch.description === null ? null : JSON.stringify(patch.description);

   if (Object.keys(set).length > 0) {
      await db
         .insert(projectDetail)
         .values({
            projectId,
            summary: set.summary ?? null,
            description: set.description ?? null,
         })
         .onConflictDoUpdate({ target: projectDetail.projectId, set });
   }
   publish({ entity: 'project', action: 'updated', id: projectId });
   return getProjectDetail(db, projectId);
}

export interface AddMilestoneInput {
   name: string;
   targetDate?: string | null;
}

export async function addMilestone(
   db: Db,
   projectId: string,
   input: AddMilestoneInput
): Promise<ProjectMilestoneDto> {
   await assertProject(db, projectId);
   if (!input.name?.trim()) throw new ApiError(400, 'name é obrigatório');
   const id = randomUUID();
   await db.insert(projectMilestone).values({
      id,
      projectId,
      name: input.name.trim(),
      targetDate: input.targetDate ?? null,
      completed: false,
   });
   publish({ entity: 'project', action: 'updated', id: projectId });
   return { id, name: input.name.trim(), targetDate: input.targetDate ?? null, completed: false };
}

export interface UpdateMilestoneInput {
   name?: string;
   targetDate?: string | null;
   completed?: boolean;
}

export async function updateMilestone(
   db: Db,
   milestoneId: string,
   patch: UpdateMilestoneInput
): Promise<ProjectMilestoneDto | null> {
   const rows = await db
      .select()
      .from(projectMilestone)
      .where(eq(projectMilestone.id, milestoneId))
      .limit(1);
   if (rows.length === 0) return null;
   const set: Partial<typeof projectMilestone.$inferInsert> = {};
   if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ApiError(400, 'name não pode ser vazio');
      set.name = patch.name.trim();
   }
   if (patch.targetDate !== undefined) set.targetDate = patch.targetDate;
   if (patch.completed !== undefined) set.completed = patch.completed;
   if (Object.keys(set).length > 0) {
      await db.update(projectMilestone).set(set).where(eq(projectMilestone.id, milestoneId));
   }
   publish({ entity: 'project', action: 'updated', id: rows[0].projectId });
   const m = { ...rows[0], ...set };
   return { id: m.id, name: m.name, targetDate: m.targetDate ?? null, completed: m.completed };
}

export async function deleteMilestone(db: Db, milestoneId: string): Promise<boolean> {
   const rows = await db
      .select({ projectId: projectMilestone.projectId })
      .from(projectMilestone)
      .where(eq(projectMilestone.id, milestoneId))
      .limit(1);
   if (rows.length === 0) return false;
   await db.delete(projectMilestone).where(eq(projectMilestone.id, milestoneId));
   publish({ entity: 'project', action: 'updated', id: rows[0].projectId });
   return true;
}

export interface AddResourceInput {
   label: string;
   url: string;
}

export async function addResource(
   db: Db,
   projectId: string,
   input: AddResourceInput
): Promise<ProjectResourceDto> {
   await assertProject(db, projectId);
   if (!input.label?.trim()) throw new ApiError(400, 'label é obrigatório');
   if (!input.url?.trim()) throw new ApiError(400, 'url é obrigatório');
   const id = randomUUID();
   await db
      .insert(projectResource)
      .values({ id, projectId, label: input.label.trim(), url: input.url.trim() });
   publish({ entity: 'project', action: 'updated', id: projectId });
   return { id, label: input.label.trim(), url: input.url.trim() };
}

/** Edita o label de um resource (Linear: hover → ⋮ → edit). */
export async function updateResource(
   db: Db,
   resourceId: string,
   input: { label: string }
): Promise<boolean> {
   if (!input.label?.trim()) throw new ApiError(400, 'label é obrigatório');
   const rows = await db
      .select({ projectId: projectResource.projectId })
      .from(projectResource)
      .where(eq(projectResource.id, resourceId))
      .limit(1);
   if (rows.length === 0) return false;
   await db
      .update(projectResource)
      .set({ label: input.label.trim() })
      .where(eq(projectResource.id, resourceId));
   publish({ entity: 'project', action: 'updated', id: rows[0].projectId });
   return true;
}

export async function deleteResource(db: Db, resourceId: string): Promise<boolean> {
   const rows = await db
      .select({ projectId: projectResource.projectId })
      .from(projectResource)
      .where(eq(projectResource.id, resourceId))
      .limit(1);
   if (rows.length === 0) return false;
   await db.delete(projectResource).where(eq(projectResource.id, resourceId));
   publish({ entity: 'project', action: 'updated', id: rows[0].projectId });
   return true;
}

export interface PostUpdateInput {
   health: ProjectUpdateHealth;
   blocks: ContentBlock[];
}

/** Persiste um "project update" (composer da aba Activity). Valida FK do projeto e do autor. */
export async function postProjectUpdate(
   db: Db,
   projectId: string,
   authorId: string,
   input: PostUpdateInput
): Promise<ProjectUpdateDto> {
   await assertProject(db, projectId);
   if (!UPDATE_HEALTHS.includes(input.health)) throw new ApiError(400, 'health inválido');
   const id = randomUUID();
   const now = new Date();
   await db.insert(projectUpdate).values({
      id,
      projectId,
      authorId,
      health: input.health,
      blocks: JSON.stringify(input.blocks ?? []),
      createdAt: now,
   });
   // Paridade Linear: o health do projeto vem do ÚLTIMO update. Os valores do update
   // (on-track/at-risk/off-track) são exatamente ids do catálogo health, então propaga
   // direto — antes o update era registrado mas o health do projeto não mudava.
   await db
      .update(projectT)
      .set({ healthId: input.health, healthUpdatedAt: now })
      .where(eq(projectT.id, projectId));
   const users = await loadUsers(db, [authorId]);
   publish({ entity: 'project', action: 'updated', id: projectId });
   return {
      id,
      author: userRef(users.get(authorId)),
      health: input.health,
      blocks: input.blocks ?? [],
      createdAt: now.toISOString(),
   };
}
