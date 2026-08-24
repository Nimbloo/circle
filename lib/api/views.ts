import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { savedView } from '@/db/schema';
import { getOrCreateUser } from './users';
import { isAdmin } from './auth';
import { ApiError } from './errors';
import { publish } from './events';

export interface ViewFilter {
   statusCategories?: string[];
   statusIds?: string[];
   labelIds?: string[];
   priorityIds?: string[];
   hasProject?: boolean;
   unassigned?: boolean;
}

type ViewRow = typeof savedView.$inferSelect;

export interface ViewDto {
   id: string;
   slug: string;
   name: string;
   description: string | null;
   icon: string | null;
   type: string; // issue|project
   teamId: string | null;
   ownerId: string;
   filter: ViewFilter;
   createdAt: string;
   updatedAt: string;
}

function parseFilter(raw: string): ViewFilter {
   try {
      return JSON.parse(raw) as ViewFilter;
   } catch {
      return {};
   }
}

function toDto(v: ViewRow): ViewDto {
   return {
      id: v.id,
      slug: v.slug,
      name: v.name,
      description: v.description,
      icon: v.icon,
      type: v.type,
      teamId: v.teamId,
      ownerId: v.ownerId,
      filter: parseFilter(v.filter),
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
      updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
   };
}

export async function listViews(db: Db, teamId?: string): Promise<ViewDto[]> {
   const rows = teamId
      ? await db.select().from(savedView).where(eq(savedView.teamId, teamId))
      : await db.select().from(savedView);
   return rows.map(toDto).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getView(db: Db, id: string): Promise<ViewDto | null> {
   const rows = await db.select().from(savedView).where(eq(savedView.id, id)).limit(1);
   return rows.length ? toDto(rows[0]) : null;
}

export interface CreateViewInput {
   slug: string;
   name: string;
   type: 'issue' | 'project';
   filter: ViewFilter;
   description?: string | null;
   icon?: string | null;
   teamId?: string | null;
}

export async function createView(
   db: Db,
   input: CreateViewInput,
   ownerEmail: string
): Promise<ViewDto> {
   if (!input.name?.trim() || !input.slug?.trim())
      throw new ApiError(400, 'slug e name são obrigatórios');
   const owner = await getOrCreateUser(db, ownerEmail);
   const id = randomUUID();
   const now = new Date();
   await db.insert(savedView).values({
      id,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      type: input.type,
      teamId: input.teamId ?? null,
      ownerId: owner.id,
      filter: JSON.stringify(input.filter ?? {}),
      createdAt: now,
      updatedAt: now,
   });
   publish({ entity: 'view', action: 'created', id, actorEmail: ownerEmail });
   return (await getView(db, id))!;
}

export interface UpdateViewInput {
   name?: string;
   description?: string | null;
   icon?: string | null;
   filter?: ViewFilter;
}

/** Verifica se o ator é dono da view (ou admin); 404 se não existir, 403 se não autorizado. */
async function assertViewOwner(db: Db, id: string, actorEmail: string): Promise<boolean> {
   const existing = await db
      .select({ ownerId: savedView.ownerId })
      .from(savedView)
      .where(eq(savedView.id, id))
      .limit(1);
   if (existing.length === 0) return false;
   const me = await getOrCreateUser(db, actorEmail);
   if (existing[0].ownerId !== me.id && !(await isAdmin(actorEmail, db)))
      throw new ApiError(403, 'Apenas o dono da view (ou admin)');
   return true;
}

export async function updateView(
   db: Db,
   id: string,
   patch: UpdateViewInput,
   actorEmail: string
): Promise<ViewDto | null> {
   if (!(await assertViewOwner(db, id, actorEmail))) return null;
   const set: Record<string, unknown> = { updatedAt: new Date() };
   if (patch.name !== undefined) set.name = patch.name;
   if (patch.description !== undefined) set.description = patch.description;
   if (patch.icon !== undefined) set.icon = patch.icon;
   if (patch.filter !== undefined) set.filter = JSON.stringify(patch.filter);
   await db.update(savedView).set(set).where(eq(savedView.id, id));
   publish({ entity: 'view', action: 'updated', id, actorEmail });
   return getView(db, id);
}

export async function deleteView(db: Db, id: string, actorEmail: string): Promise<boolean> {
   if (!(await assertViewOwner(db, id, actorEmail))) return false;
   await db.delete(savedView).where(eq(savedView.id, id));
   publish({ entity: 'view', action: 'deleted', id, actorEmail });
   return true;
}
