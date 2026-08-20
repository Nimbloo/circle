import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, or, sql, ilike, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   issue,
   issueLabel,
   issueContent,
   activityEvent,
   status as statusT,
   priority as priorityT,
   label as labelT,
   appUser,
   project as projectT,
   team as teamT,
} from '@/db/schema';
import { getOrCreateUser } from './users';
import { rankAfter, firstRank, rankBetween } from './rank';
import { ApiError } from './errors';

// ── Tipos de DTO (espelham o tipo Issue do frontend) ────────────────
type StatusRow = typeof statusT.$inferSelect;
type PriorityRow = typeof priorityT.$inferSelect;
type LabelRow = typeof labelT.$inferSelect;
type UserRow = typeof appUser.$inferSelect;

export interface UserRef {
   id: string;
   slug: string;
   name: string;
   email: string;
   avatarUrl: string | null;
}
export interface ProjectRef {
   id: string;
   name: string;
   iconKey: string | null;
}
export interface IssueDto {
   id: string;
   identifier: string;
   teamId: string;
   title: string;
   status: StatusRow;
   priority: PriorityRow;
   assignee: UserRef | null;
   createdBy: UserRef | null;
   project: ProjectRef | null;
   cycleId: string; // '' = sem ciclo (paridade com o front)
   labels: LabelRow[];
   rank: string;
   dueDate: string | null;
   createdAt: string;
   updatedAt: string;
}

function userRef(u: UserRow | undefined): UserRef | null {
   if (!u) return null;
   return { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl };
}

// ── Filtros (derivados da barra do front + escopos das rotas) ────────
export interface IssueFilter {
   team?: string;
   status?: string[];
   statusType?: string[]; // categorias
   assignee?: string[]; // inclui 'unassigned'
   priority?: string[];
   labels?: string[];
   project?: string[];
   cycle?: string[]; // inclui 'no-cycle'
   assigneeMe?: string; // e-mail do usuário (my-issues assigned)
   createdByMe?: string;
   q?: string;
}

export interface IssueListOptions extends IssueFilter {
   orderBy?: 'rank' | 'priority' | 'created' | 'title';
}

interface CatalogMaps {
   statuses: Map<string, StatusRow>;
   priorities: Map<string, PriorityRow>;
   labels: Map<string, LabelRow>;
}

async function loadCatalogs(db: Db): Promise<CatalogMaps> {
   const [statuses, priorities, labels] = await Promise.all([
      db.select().from(statusT),
      db.select().from(priorityT),
      db.select().from(labelT),
   ]);
   return {
      statuses: new Map(statuses.map((s) => [s.id, s])),
      priorities: new Map(priorities.map((p) => [p.id, p])),
      labels: new Map(labels.map((l) => [l.id, l])),
   };
}

/** Expande categorias (statusType) para os statusIds correspondentes. */
function statusIdsForCategories(cats: string[], statuses: Map<string, StatusRow>): string[] {
   const set = new Set(cats);
   return [...statuses.values()].filter((s) => set.has(s.category)).map((s) => s.id);
}

function buildWhere(
   opts: IssueFilter,
   statuses: Map<string, StatusRow>,
   meId?: string
): SQL | undefined {
   const conds: SQL[] = [];
   if (opts.team) conds.push(eq(issue.teamId, opts.team));
   if (opts.status?.length) conds.push(inArray(issue.statusId, opts.status));
   if (opts.statusType?.length) {
      const ids = statusIdsForCategories(opts.statusType, statuses);
      conds.push(ids.length ? inArray(issue.statusId, ids) : sql`false`);
   }
   if (opts.priority?.length) conds.push(inArray(issue.priorityId, opts.priority));
   if (opts.project?.length) conds.push(inArray(issue.projectId, opts.project));
   if (opts.assignee?.length) {
      const wantUnassigned = opts.assignee.includes('unassigned');
      const ids = opts.assignee.filter((a) => a !== 'unassigned');
      const parts: SQL[] = [];
      if (ids.length) parts.push(inArray(issue.assigneeId, ids));
      if (wantUnassigned) parts.push(isNull(issue.assigneeId));
      if (parts.length) conds.push(parts.length === 1 ? parts[0] : (or(...parts) as SQL));
   }
   if (opts.cycle?.length) {
      const wantNone = opts.cycle.includes('no-cycle');
      const ids = opts.cycle.filter((c) => c !== 'no-cycle');
      const parts: SQL[] = [];
      if (ids.length) parts.push(inArray(issue.cycleId, ids));
      if (wantNone) parts.push(isNull(issue.cycleId));
      if (parts.length) conds.push(parts.length === 1 ? parts[0] : (or(...parts) as SQL));
   }
   if (opts.assigneeMe && meId) conds.push(eq(issue.assigneeId, meId));
   if (opts.createdByMe && meId) conds.push(eq(issue.createdById, meId));
   if (opts.q) {
      const like = `%${opts.q}%`;
      conds.push(or(ilike(issue.title, like), ilike(issue.identifier, like)) as SQL);
   }
   return conds.length ? and(...conds) : undefined;
}

/** Monta os DTOs resolvendo relações (batch-load; catálogos são pequenos). */
async function assemble(
   db: Db,
   rows: (typeof issue.$inferSelect)[],
   cat: CatalogMaps
): Promise<IssueDto[]> {
   if (rows.length === 0) return [];
   const issueIds = rows.map((r) => r.id);
   const userIds = [
      ...new Set(rows.flatMap((r) => [r.assigneeId, r.createdById]).filter(Boolean) as string[]),
   ];
   const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean) as string[])];

   const [users, projects, labelLinks] = await Promise.all([
      userIds.length
         ? db.select().from(appUser).where(inArray(appUser.id, userIds))
         : Promise.resolve([]),
      projectIds.length
         ? db
              .select({ id: projectT.id, name: projectT.name, iconKey: projectT.iconKey })
              .from(projectT)
              .where(inArray(projectT.id, projectIds))
         : Promise.resolve([]),
      db.select().from(issueLabel).where(inArray(issueLabel.issueId, issueIds)),
   ]);
   const userMap = new Map(users.map((u) => [u.id, u]));
   const projectMap = new Map(projects.map((p) => [p.id, p]));
   const labelsByIssue = new Map<string, LabelRow[]>();
   for (const link of labelLinks) {
      const lbl = cat.labels.get(link.labelId);
      if (!lbl) continue;
      const arr = labelsByIssue.get(link.issueId) ?? [];
      arr.push(lbl);
      labelsByIssue.set(link.issueId, arr);
   }

   return rows.map((r) => ({
      id: r.id,
      identifier: r.identifier,
      teamId: r.teamId,
      title: r.title,
      status: cat.statuses.get(r.statusId)!,
      priority: cat.priorities.get(r.priorityId)!,
      assignee: userRef(r.assigneeId ? userMap.get(r.assigneeId) : undefined),
      createdBy: userRef(r.createdById ? userMap.get(r.createdById) : undefined),
      project:
         r.projectId && projectMap.get(r.projectId)
            ? {
                 id: r.projectId,
                 name: projectMap.get(r.projectId)!.name,
                 iconKey: projectMap.get(r.projectId)!.iconKey,
              }
            : null,
      cycleId: r.cycleId ?? '',
      labels: labelsByIssue.get(r.id) ?? [],
      rank: r.rank,
      dueDate: r.dueDate,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
   }));
}

function orderRows(rows: IssueDto[], orderBy: IssueListOptions['orderBy']): IssueDto[] {
   if (orderBy === 'priority')
      return [...rows].sort((a, b) => a.priority.sortRank - b.priority.sortRank);
   if (orderBy === 'created')
      return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
   if (orderBy === 'title') return [...rows].sort((a, b) => a.title.localeCompare(b.title));
   return rows; // já vem por rank asc do banco
}

// ── Operações ───────────────────────────────────────────────────────
export async function listIssues(
   db: Db,
   opts: IssueListOptions = {},
   meId?: string
): Promise<IssueDto[]> {
   const cat = await loadCatalogs(db);
   const where = buildWhere(opts, cat.statuses, meId);
   const rows = await db.select().from(issue).where(where).orderBy(asc(issue.rank));
   const dtos = await assemble(db, rows, cat);
   return orderRows(dtos, opts.orderBy);
}

export async function getIssue(db: Db, id: string): Promise<IssueDto | null> {
   const cat = await loadCatalogs(db);
   const rows = await db.select().from(issue).where(eq(issue.id, id)).limit(1);
   if (rows.length === 0) return null;
   return (await assemble(db, rows, cat))[0];
}

export async function getIssueByIdentifier(db: Db, identifier: string): Promise<IssueDto | null> {
   const cat = await loadCatalogs(db);
   const rows = await db.select().from(issue).where(eq(issue.identifier, identifier)).limit(1);
   if (rows.length === 0) return null;
   return (await assemble(db, rows, cat))[0];
}

export interface CreateIssueInput {
   teamId: string;
   title: string;
   statusId: string;
   priorityId: string;
   assigneeId?: string | null;
   projectId?: string | null;
   cycleId?: string | null;
   labelIds?: string[];
   dueDate?: string | null;
   description?: string | null;
}

/** Gera identifier (<TEAM_KEY>-<seq> atômico) e rank (append), cria a issue + labels + evento. */
export async function createIssue(
   db: Db,
   input: CreateIssueInput,
   actorEmail: string
): Promise<IssueDto> {
   const actor = await getOrCreateUser(db, actorEmail);

   const teamRows = await db.select().from(teamT).where(eq(teamT.id, input.teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(400, `Team '${input.teamId}' não existe`);

   // identifier: incremento atômico do contador do time
   const seqRes = await db
      .update(teamT)
      .set({ issueSeq: sql`${teamT.issueSeq} + 1` })
      .where(eq(teamT.id, input.teamId))
      .returning({ seq: teamT.issueSeq });
   const identifier = `${input.teamId}-${seqRes[0].seq}`;

   // rank: após o maior rank existente
   const maxRankRows = await db
      .select({ r: issue.rank })
      .from(issue)
      .orderBy(sql`${issue.rank} DESC`)
      .limit(1);
   const rank = maxRankRows.length ? rankAfter(maxRankRows[0].r) : firstRank();

   const id = randomUUID();
   const now = new Date();
   await db.insert(issue).values({
      id,
      identifier,
      teamId: input.teamId,
      title: input.title,
      statusId: input.statusId,
      priorityId: input.priorityId,
      assigneeId: input.assigneeId ?? null,
      createdById: actor.id,
      projectId: input.projectId ?? null,
      cycleId: input.cycleId || null,
      rank,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
   });

   if (input.description) {
      await db
         .insert(issueContent)
         .values({ issueId: id, description: input.description, milestone: null });
   }
   if (input.labelIds?.length) {
      await db
         .insert(issueLabel)
         .values(input.labelIds.map((labelId) => ({ issueId: id, labelId })))
         .onConflictDoNothing();
   }
   await db.insert(activityEvent).values({
      id: randomUUID(),
      issueId: id,
      actorId: actor.id,
      event: 'created',
      text: 'created the issue',
      createdAt: now,
   });

   return (await getIssue(db, id))!;
}

export interface UpdateIssueInput {
   title?: string;
   statusId?: string;
   priorityId?: string;
   assigneeId?: string | null;
   projectId?: string | null;
   cycleId?: string | null;
   dueDate?: string | null;
}

export async function updateIssue(
   db: Db,
   id: string,
   patch: UpdateIssueInput,
   actorEmail: string
): Promise<IssueDto | null> {
   const existing = await db.select().from(issue).where(eq(issue.id, id)).limit(1);
   if (existing.length === 0) return null;
   const actor = await getOrCreateUser(db, actorEmail);
   const prev = existing[0];

   const set: Record<string, unknown> = { updatedAt: new Date() };
   if (patch.title !== undefined) set.title = patch.title;
   if (patch.statusId !== undefined) set.statusId = patch.statusId;
   if (patch.priorityId !== undefined) set.priorityId = patch.priorityId;
   if (patch.assigneeId !== undefined) set.assigneeId = patch.assigneeId;
   if (patch.projectId !== undefined) set.projectId = patch.projectId;
   if (patch.cycleId !== undefined) set.cycleId = patch.cycleId || null;
   if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;

   await db.update(issue).set(set).where(eq(issue.id, id));

   // eventos de atividade para transições relevantes
   const events: { event: string; text: string }[] = [];
   if (patch.statusId !== undefined && patch.statusId !== prev.statusId)
      events.push({ event: 'status', text: `changed status` });
   if (patch.priorityId !== undefined && patch.priorityId !== prev.priorityId)
      events.push({ event: 'priority', text: `changed priority` });
   if (patch.cycleId !== undefined && (patch.cycleId || null) !== prev.cycleId)
      events.push({ event: 'cycle', text: `changed cycle` });
   if (events.length) {
      const now = new Date();
      await db
         .insert(activityEvent)
         .values(
            events.map((e) => ({
               id: randomUUID(),
               issueId: id,
               actorId: actor.id,
               event: e.event,
               text: e.text,
               createdAt: now,
            }))
         );
   }
   return getIssue(db, id);
}

export async function deleteIssue(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: issue.id }).from(issue).where(eq(issue.id, id)).limit(1);
   if (existing.length === 0) return false;
   await db.delete(activityEvent).where(eq(activityEvent.issueId, id));
   await db.delete(issueLabel).where(eq(issueLabel.issueId, id));
   await db.delete(issueContent).where(eq(issueContent.issueId, id));
   await db.delete(issue).where(eq(issue.id, id));
   return true;
}

/** Reordena via lexorank entre dois vizinhos (drag-and-drop). */
export async function reorderIssue(
   db: Db,
   id: string,
   beforeId?: string | null,
   afterId?: string | null
): Promise<IssueDto | null> {
   const getRank = async (rid?: string | null) => {
      if (!rid) return null;
      const r = await db.select({ r: issue.rank }).from(issue).where(eq(issue.id, rid)).limit(1);
      return r.length ? r[0].r : null;
   };
   const before = await getRank(beforeId);
   const after = await getRank(afterId);
   const newRank = rankBetween(before, after);
   const res = await db
      .update(issue)
      .set({ rank: newRank, updatedAt: new Date() })
      .where(eq(issue.id, id))
      .returning({ id: issue.id });
   if (res.length === 0) return null;
   return getIssue(db, id);
}

export async function addLabel(db: Db, id: string, labelId: string): Promise<IssueDto | null> {
   await db.insert(issueLabel).values({ issueId: id, labelId }).onConflictDoNothing();
   return getIssue(db, id);
}

export async function removeLabel(db: Db, id: string, labelId: string): Promise<IssueDto | null> {
   await db
      .delete(issueLabel)
      .where(and(eq(issueLabel.issueId, id), eq(issueLabel.labelId, labelId)));
   return getIssue(db, id);
}
