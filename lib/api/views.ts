import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { savedView } from '@/db/schema';
import { getOrCreateUser } from './users';
import { isAdmin } from './auth';
import { listIssues, type IssueDto } from './issues';
import { listProjects, type ProjectDto } from './projects';
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

/**
 * Lista views aplicando o escopo pessoal/compartilhada (paridade Linear):
 * - `viewerId` definido → retorna as COMPARTILHADAS (com teamId) + as PESSOAIS do viewer
 *   (ownerId = viewerId). Antes toda view era global (todos viam as pessoais de todos).
 * - `viewerId` omitido → todas (uso administrativo/interno).
 * `teamId` restringe a um time específico (listagem por time).
 */
export async function listViews(db: Db, teamId?: string, viewerId?: string): Promise<ViewDto[]> {
   const conds = [];
   if (teamId) conds.push(eq(savedView.teamId, teamId));
   if (viewerId) conds.push(or(isNotNull(savedView.teamId), eq(savedView.ownerId, viewerId))!);
   const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
   const rows = where
      ? await db.select().from(savedView).where(where)
      : await db.select().from(savedView);
   return rows.map(toDto).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getView(db: Db, id: string, viewerId?: string): Promise<ViewDto | null> {
   const rows = await db.select().from(savedView).where(eq(savedView.id, id)).limit(1);
   if (!rows.length) return null;
   const v = rows[0];
   // View PESSOAL (sem time) só é visível ao dono — senão qualquer autenticado leria a
   // view pessoal de outro por id direto (mesma regra do listViews).
   if (viewerId && !v.teamId && v.ownerId !== viewerId) return null;
   return toDto(v);
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

/** Aplica o filtro salvo da view a issues (ou projects). */
export async function resolveView(
   db: Db,
   id: string,
   viewerId?: string
): Promise<{ type: string; issues?: IssueDto[]; projects?: ProjectDto[] } | null> {
   const view = await getView(db, id, viewerId);
   if (!view) return null;
   const f = view.filter;

   if (view.type === 'issue') {
      let issues = await listIssues(db, {
         statusType: f.statusCategories,
         status: f.statusIds,
         labels: f.labelIds,
         priority: f.priorityIds,
         assignee: f.unassigned ? ['unassigned'] : undefined,
      });
      if (f.hasProject) issues = issues.filter((i) => i.project !== null);
      return { type: 'issue', issues };
   }

   // project view: aplica o que mapeia (status/priority/labels)
   let projects = await listProjects(db, {});
   if (f.statusIds?.length) projects = projects.filter((p) => f.statusIds!.includes(p.status.id));
   if (f.priorityIds?.length)
      projects = projects.filter((p) => f.priorityIds!.includes(p.priority.id));
   if (f.labelIds?.length)
      projects = projects.filter((p) => p.labels.some((l) => f.labelIds!.includes(l.id)));
   return { type: 'project', projects };
}
