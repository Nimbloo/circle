import { randomUUID } from 'node:crypto';
import {
   and,
   asc,
   eq,
   gt,
   inArray,
   isNull,
   notInArray,
   or,
   sql,
   ilike,
   type SQL,
} from 'drizzle-orm';
import type { Db } from '@/db';
import {
   issue,
   issueLabel,
   issueContent,
   issueSubscription,
   activityEvent,
   issueRelation,
   issuePrLink,
   comment,
   commentReaction,
   notification,
   status as statusT,
   priority as priorityT,
   label as labelT,
   appUser,
   project as projectT,
   team as teamT,
   cycle as cycleT,
   projectMilestone as projectMilestoneT,
} from '@/db/schema';
import { getOrCreateUser } from './users';
import { rankAfter, firstRank, rankBetween } from './rank';
import { ApiError } from './errors';
import { dispatchNotification } from './notify';
import { getCachedCatalogs } from './catalogs';
import { publish } from './events';
import { notifySlackEvent } from './integrations/slack';

/** Teto default de linhas nas listagens (proteção; paginação por cursor fica p/ depois). */
const DEFAULT_LIST_LIMIT = 500;

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
   estimate: number | null;
   /** Rollup de sub-issues (paridade Linear): total de filhas e quantas concluídas. */
   subIssueCount: number;
   subIssueDoneCount: number;
   /** Snooze de triage: ISO enquanto adiada, null caso contrário. */
   snoozedUntil: string | null;
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
   /** Tamanho da página. Default = DEFAULT_LIST_LIMIT (compat com chamadas sem paginação). */
   limit?: number;
   /** Cursor keyset = o `rank` do último item da página anterior (só na ordem default asc(rank)). */
   cursor?: string;
}

interface CatalogMaps {
   statuses: Map<string, StatusRow>;
   priorities: Map<string, PriorityRow>;
   labels: Map<string, LabelRow>;
}

async function loadCatalogs(db: Db): Promise<CatalogMaps> {
   const { statuses, priorities, labels } = await getCachedCatalogs(db);
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
   db: Db,
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
   if (opts.labels?.length) {
      conds.push(
         inArray(
            issue.id,
            db
               .select({ id: issueLabel.issueId })
               .from(issueLabel)
               .where(inArray(issueLabel.labelId, opts.labels))
         )
      );
   }
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
      // casa título, identifier, o corpo (issue_content.description) E os comentários.
      // A busca client-side só alcança título/identifier; descrição e comentários só
      // via servidor (full-text simples, paridade Linear que indexa comentários).
      conds.push(
         or(
            ilike(issue.title, like),
            ilike(issue.identifier, like),
            inArray(
               issue.id,
               db
                  .select({ id: issueContent.issueId })
                  .from(issueContent)
                  .where(ilike(issueContent.description, like))
            ),
            inArray(
               issue.id,
               db.select({ id: comment.issueId }).from(comment).where(ilike(comment.body, like))
            )
         ) as SQL
      );
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

   const [users, projects, labelLinks, subRels] = await Promise.all([
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
      db
         .select({ parentId: issueRelation.issueId, childId: issueRelation.relatedId })
         .from(issueRelation)
         .where(and(inArray(issueRelation.issueId, issueIds), eq(issueRelation.kind, 'sub'))),
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

   // Rollup de sub-issues: as filhas podem não estar nesta página, então busca o
   // status delas direto. done = status na categoria 'completed'.
   const childIds = [...new Set(subRels.map((r) => r.childId))];
   const childCategory = new Map<string, string>();
   if (childIds.length) {
      const children = await db
         .select({ id: issue.id, statusId: issue.statusId })
         .from(issue)
         .where(inArray(issue.id, childIds));
      for (const c of children)
         childCategory.set(c.id, cat.statuses.get(c.statusId)?.category ?? '');
   }
   const rollup = new Map<string, { count: number; done: number }>();
   for (const rel of subRels) {
      const agg = rollup.get(rel.parentId) ?? { count: 0, done: 0 };
      agg.count += 1;
      if (childCategory.get(rel.childId) === 'completed') agg.done += 1;
      rollup.set(rel.parentId, agg);
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
      estimate: r.estimate,
      subIssueCount: rollup.get(r.id)?.count ?? 0,
      subIssueDoneCount: rollup.get(r.id)?.done ?? 0,
      snoozedUntil:
         r.snoozedUntil instanceof Date ? r.snoozedUntil.toISOString() : (r.snoozedUntil ?? null),
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

/**
 * Ordenação NO SQL, para o LIMIT pegar o top-N CERTO (antes, ordenava sempre por rank e
 * só reordenava em memória → com >limit issues, `created`/`priority`/`title` devolviam um
 * subconjunto arbitrário). `orderRows` continua como ordenação final exata sobre esse set.
 */
function listOrder(orderBy: IssueListOptions['orderBy'], cat: CatalogMaps): SQL[] {
   if (orderBy === 'created') return [sql`${issue.createdAt} desc`];
   if (orderBy === 'title') return [asc(issue.title)];
   if (orderBy === 'priority') {
      // CASE mapeia priorityId → sortRank (mesmo critério do orderRows final); catálogo
      // pequeno e fechado. priorityId ausente/desconhecido vai pro fim.
      const whens = [...cat.priorities.values()].map(
         (p) => sql`when ${issue.priorityId} = ${p.id} then ${p.sortRank}`
      );
      return whens.length > 0
         ? [sql`(case ${sql.join(whens, sql` `)} else 999 end) asc`, asc(issue.rank)]
         : [asc(issue.rank)];
   }
   return [asc(issue.rank)];
}

// ── Operações ───────────────────────────────────────────────────────
export async function listIssues(
   db: Db,
   opts: IssueListOptions = {},
   meId?: string
): Promise<IssueDto[]> {
   const cat = await loadCatalogs(db);
   // Resolve o meId a partir do e-mail em opts (assignee=me / createdBy=me) quando o
   // chamador não o passou — senão o filtro `me` era um no-op silencioso (retornava tudo).
   if (!meId) {
      const meEmail = opts.assigneeMe ?? opts.createdByMe;
      if (meEmail) {
         const rows = await db
            .select({ id: appUser.id })
            .from(appUser)
            .where(eq(appUser.email, meEmail.trim().toLowerCase()))
            .limit(1);
         meId = rows[0]?.id;
      }
   }
   const where = buildWhere(db, opts, cat.statuses, meId);
   // Keyset por rank: só na ordem default asc(rank) (o board). Cursor = último rank
   // da página anterior → `rank > cursor`. Em outras ordens, sem cursor (cai no limit).
   const rankOrder = !opts.orderBy || opts.orderBy === 'rank';
   const keyset = opts.cursor && rankOrder ? gt(issue.rank, opts.cursor) : undefined;
   const finalWhere = keyset ? (where ? and(where, keyset) : keyset) : where;
   const rows = await db
      .select()
      .from(issue)
      .where(finalWhere)
      .orderBy(...listOrder(opts.orderBy, cat))
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
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
   estimate?: number | null;
   description?: string | null;
   /** Origem Sentry (dedup): id da issue do Sentry. Único no banco. */
   sentryIssueId?: string | null;
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

   // valida FKs de catálogo antes do insert (senão a FK estoura como 500). Usa o cache
   // de catálogos (memoizado, TTL 30s) em vez de 2 SELECTs por criação de issue.
   const catalogs = await loadCatalogs(db);
   const statusRow = catalogs.statuses.get(input.statusId);
   if (!statusRow) throw new ApiError(400, `Status '${input.statusId}' não existe`);
   // Marcos temporais quando a issue já nasce started/completed (cycle/lead time).
   const startCat = statusRow.category;
   if (!catalogs.priorities.get(input.priorityId))
      throw new ApiError(400, `Priority '${input.priorityId}' não existe`);

   const id = randomUUID();
   const now = new Date();

   // Atômico: incremento do contador + issue + content + labels + evento.
   await db.transaction(async (tx) => {
      // identifier: incremento atômico do contador do time
      const seqRes = await tx
         .update(teamT)
         .set({ issueSeq: sql`${teamT.issueSeq} + 1` })
         .where(eq(teamT.id, input.teamId))
         .returning({ seq: teamT.issueSeq });
      const identifier = `${input.teamId}-${seqRes[0].seq}`;

      // rank: após o maior rank existente
      const maxRankRows = await tx
         .select({ r: issue.rank })
         .from(issue)
         .orderBy(sql`${issue.rank} DESC`)
         .limit(1);
      const rank = maxRankRows.length ? rankAfter(maxRankRows[0].r) : firstRank();

      await tx.insert(issue).values({
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
         estimate: input.estimate ?? null,
         sentryIssueId: input.sentryIssueId ?? null,
         startedAt: startCat === 'started' || startCat === 'completed' ? now : null,
         completedAt: startCat === 'completed' ? now : null,
         createdAt: now,
         updatedAt: now,
      });

      if (input.description) {
         await tx
            .insert(issueContent)
            .values({ issueId: id, description: input.description, milestone: null });
      }
      if (input.labelIds?.length) {
         await tx
            .insert(issueLabel)
            .values(input.labelIds.map((labelId) => ({ issueId: id, labelId })))
            .onConflictDoNothing();
      }
      await tx.insert(activityEvent).values({
         id: randomUUID(),
         issueId: id,
         actorId: actor.id,
         event: 'created',
         text: 'created the issue',
         createdAt: now,
      });

      // auto-subscribe (Linear-style): criador + assignee inicial
      const subscribers = new Set<string>([actor.id]);
      if (input.assigneeId) subscribers.add(input.assigneeId);
      await tx
         .insert(issueSubscription)
         .values([...subscribers].map((userId) => ({ issueId: id, userId })))
         .onConflictDoNothing();
   });

   publish({ entity: 'issue', action: 'created', id, actorEmail });
   const created = (await getIssue(db, id))!;
   // Notificação Slack (best-effort, fire-and-forget — não acopla latência à request).
   void notifySlackEvent(db, {
      type: 'issue.created',
      identifier: created.identifier,
      title: created.title,
      actor: actor.name,
   });
   return created;
}

export interface UpdateIssueInput {
   title?: string;
   statusId?: string;
   priorityId?: string;
   assigneeId?: string | null;
   projectId?: string | null;
   cycleId?: string | null;
   dueDate?: string | null;
   estimate?: number | null;
   /** Snooze de triage: ISO para adiar, null para reativar. */
   snoozedUntil?: string | null;
   /** Milestone estruturada (FK project_milestone) ou null p/ remover. */
   milestoneId?: string | null;
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
   // `""` (limpar o campo) → null, consistente com cycleId: senão a FK vira 404
   // "recurso não existe" em vez de desatribuir/desvincular.
   if (patch.assigneeId !== undefined) set.assigneeId = patch.assigneeId || null;
   if (patch.projectId !== undefined) set.projectId = patch.projectId || null;
   if (patch.cycleId !== undefined) set.cycleId = patch.cycleId || null;
   if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
   if (patch.estimate !== undefined) set.estimate = patch.estimate;
   if (patch.snoozedUntil !== undefined)
      set.snoozedUntil = patch.snoozedUntil ? new Date(patch.snoozedUntil) : null;
   if (patch.milestoneId !== undefined) {
      if (patch.milestoneId) {
         // valida que a milestone pertence ao projeto da issue (após aplicar o patch de projeto)
         const projectId = patch.projectId !== undefined ? patch.projectId || null : prev.projectId;
         const [m] = await db
            .select({ projectId: projectMilestoneT.projectId })
            .from(projectMilestoneT)
            .where(eq(projectMilestoneT.id, patch.milestoneId))
            .limit(1);
         if (!m) throw new ApiError(400, 'Milestone inválida');
         if (m.projectId !== projectId)
            throw new ApiError(400, 'Milestone não pertence ao projeto da issue');
      }
      set.milestoneId = patch.milestoneId || null;
   } else if (patch.projectId !== undefined && (patch.projectId || null) !== prev.projectId) {
      // Trocou/removeu o projeto SEM tocar em milestone: a milestone atual pertence ao
      // projeto ANTIGO → limpa (senão fica órfã, inflando progresso e aparecendo em issue
      // de outro projeto). project_milestone não tem FK cascade, então é app-level.
      if (prev.milestoneId) set.milestoneId = null;
   }

   // Transição de status: marcos temporais (cycle/lead time) + auto-add ao cycle.
   let enteredCompleted = false;
   if (patch.statusId !== undefined && patch.statusId !== prev.statusId) {
      const cat = (await loadCatalogs(db)).statuses.get(patch.statusId)?.category;
      const now = set.updatedAt as Date;
      enteredCompleted = cat === 'completed';
      // startedAt: 1ª entrada em "started" (sticky — não sobrescreve).
      if (cat === 'started' && !prev.startedAt) set.startedAt = now;
      // completedAt: entra em "completed" grava; sai de "completed" (reabriu) limpa.
      if (cat === 'completed') {
         set.completedAt = now;
         // Pulou direto p/ done sem passar por started: cycle time ~0 (consistente c/ create).
         if (!prev.startedAt) set.startedAt = now;
      } else if (prev.completedAt) {
         set.completedAt = null;
      }

      // Auto-add ao cycle atual (paridade Linear): issue que ENTRA em "started" e não tem
      // cycle é atribuída ao cycle corrente do time — a menos que o cycle esteja sendo
      // setado explicitamente neste patch.
      if (cat === 'started' && patch.cycleId === undefined && !prev.cycleId) {
         const [cur] = await db
            .select({ id: cycleT.id })
            .from(cycleT)
            .where(and(eq(cycleT.teamId, prev.teamId), eq(cycleT.status, 'current')))
            .limit(1);
         if (cur) set.cycleId = cur.id;
      }
   }

   // O auto-add acima é uma das MAIORES fontes de crescimento de escopo do ciclo, e
   // era completamente invisível no histórico: o evento de `cycle` só é emitido quando
   // `patch.cycleId` vem preenchido, e aqui ele vem `undefined`.
   const autoAddedCycleId =
      set.cycleId !== undefined && patch.cycleId === undefined ? (set.cycleId as string) : null;

   await db.update(issue).set(set).where(eq(issue.id, id));

   // eventos de atividade para transições relevantes
   const events: { event: string; text: string }[] = [];
   if (patch.statusId !== undefined && patch.statusId !== prev.statusId)
      events.push({ event: 'status', text: `changed status` });
   if (patch.priorityId !== undefined && patch.priorityId !== prev.priorityId)
      events.push({ event: 'priority', text: `changed priority` });
   // De/para no texto: sem isso o histórico não permite reconstruir o escopo de um
   // ciclo ao longo do tempo — foi o que bloqueou o `scopeDelta` real (#24).
   if (patch.cycleId !== undefined && (patch.cycleId || null) !== prev.cycleId)
      events.push({
         event: 'cycle',
         text: `changed cycle from ${prev.cycleId ?? 'none'} to ${patch.cycleId ?? 'none'}`,
      });
   if (autoAddedCycleId)
      events.push({
         event: 'cycle',
         text: `added to cycle ${autoAddedCycleId} on start`,
      });
   if (patch.assigneeId !== undefined && (patch.assigneeId || null) !== prev.assigneeId)
      events.push({ event: 'assignee', text: `changed assignee` });
   if (patch.title !== undefined && patch.title !== prev.title)
      events.push({ event: 'title', text: `renamed the issue` });
   if (patch.projectId !== undefined && (patch.projectId || null) !== prev.projectId)
      events.push({ event: 'project', text: `changed project` });
   if (patch.estimate !== undefined && (patch.estimate ?? null) !== prev.estimate)
      events.push({
         event: 'estimate',
         text: `changed estimate from ${prev.estimate ?? 'none'} to ${patch.estimate ?? 'none'}`,
      });
   if (patch.dueDate !== undefined && (patch.dueDate ?? null) !== prev.dueDate)
      events.push({ event: 'dueDate', text: `changed due date` });
   if (events.length) {
      const now = new Date();
      await db.insert(activityEvent).values(
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

   // auto-subscribe do novo responsável (Linear-style; inclui auto-atribuição)
   if (patch.assigneeId !== undefined && patch.assigneeId && patch.assigneeId !== prev.assigneeId) {
      await subscribeToIssue(db, id, patch.assigneeId);
   }

   // Notifica o novo responsável (in-app + Slack/Email best-effort)
   if (
      patch.assigneeId !== undefined &&
      patch.assigneeId &&
      patch.assigneeId !== prev.assigneeId &&
      patch.assigneeId !== actor.id
   ) {
      // Fire-and-forget: notificação (Slack/SES) não bloqueia a resposta do PATCH.
      // `dispatchNotification` captura os próprios erros (loga, não lança).
      void dispatchNotification(db, {
         type: 'assignment',
         issueId: id,
         recipientId: patch.assigneeId,
         actorId: actor.id,
         content: `${actor.name} atribuiu esta issue a você`,
      });
   }

   publish({ entity: 'issue', action: 'updated', id, actorEmail });
   const dto = await getIssue(db, id);
   // Feed do canal Slack (best-effort, fire-and-forget). Gated pelo slack_config admin.
   if (dto) {
      if (enteredCompleted)
         void notifySlackEvent(db, {
            type: 'issue.completed',
            identifier: dto.identifier,
            title: dto.title,
         });
      const assignedNow =
         patch.assigneeId !== undefined && patch.assigneeId && patch.assigneeId !== prev.assigneeId;
      if (assignedNow && dto.assignee)
         void notifySlackEvent(db, {
            type: 'issue.assigned',
            identifier: dto.identifier,
            title: dto.title,
            assignee: dto.assignee.name,
         });
   }
   return dto;
}

export async function deleteIssue(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: issue.id }).from(issue).where(eq(issue.id, id)).limit(1);
   if (existing.length === 0) return false;

   // Atômico: limpa todas as dependências (FKs) antes de remover a issue.
   await db.transaction(async (tx) => {
      // reações das comments desta issue → comments
      const comments = await tx
         .select({ id: comment.id })
         .from(comment)
         .where(eq(comment.issueId, id));
      const commentIds = comments.map((c) => c.id);
      if (commentIds.length) {
         await tx.delete(commentReaction).where(inArray(commentReaction.commentId, commentIds));
      }
      await tx.delete(comment).where(eq(comment.issueId, id));

      // relações nas DUAS direções (issueId e relatedId)
      await tx
         .delete(issueRelation)
         .where(or(eq(issueRelation.issueId, id), eq(issueRelation.relatedId, id)));

      await tx.delete(issuePrLink).where(eq(issuePrLink.issueId, id));
      await tx.delete(notification).where(eq(notification.issueId, id));
      await tx.delete(activityEvent).where(eq(activityEvent.issueId, id));
      await tx.delete(issueLabel).where(eq(issueLabel.issueId, id));
      await tx.delete(issueSubscription).where(eq(issueSubscription.issueId, id));
      await tx.delete(issueContent).where(eq(issueContent.issueId, id));
      await tx.delete(issue).where(eq(issue.id, id));
   });
   publish({ entity: 'issue', action: 'deleted', id });
   return true;
}

/** Assina uma issue (idempotente) — usado no auto-subscribe e no toggle manual. */
export async function subscribeToIssue(db: Db, id: string, userId: string): Promise<void> {
   await db.insert(issueSubscription).values({ issueId: id, userId }).onConflictDoNothing();
}

/** Cancela a assinatura de uma issue. */
export async function unsubscribeFromIssue(db: Db, id: string, userId: string): Promise<void> {
   await db
      .delete(issueSubscription)
      .where(and(eq(issueSubscription.issueId, id), eq(issueSubscription.userId, userId)));
}

/** Ids das issues assinadas pelo usuário (alimenta a aba Subscribed do My issues). */
export async function listSubscribedIssueIds(db: Db, userId: string): Promise<string[]> {
   const rows = await db
      .select({ issueId: issueSubscription.issueId })
      .from(issueSubscription)
      .where(eq(issueSubscription.userId, userId));
   return rows.map((r) => r.issueId);
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
   publish({ entity: 'issue', action: 'updated', id });
   return getIssue(db, id);
}

export async function addLabel(
   db: Db,
   id: string,
   labelId: string,
   actorEmail: string
): Promise<IssueDto | null> {
   // valida issue e label antes do insert (senão a FK estoura como 500)
   const issueRows = await db.select({ id: issue.id }).from(issue).where(eq(issue.id, id)).limit(1);
   if (issueRows.length === 0) throw new ApiError(404, `Issue '${id}' não encontrada`);
   const labelRows = await db
      .select({ id: labelT.id, name: labelT.name, groupId: labelT.groupId })
      .from(labelT)
      .where(eq(labelT.id, labelId))
      .limit(1);
   if (labelRows.length === 0) throw new ApiError(400, `Label '${labelId}' não existe`);

   // Grupo mutuamente exclusivo (paridade Linear): ao adicionar uma label de um grupo,
   // remove as outras labels do MESMO grupo já na issue (uma por grupo).
   const groupId = labelRows[0].groupId;
   if (groupId) {
      const siblings = await db
         .select({ id: labelT.id })
         .from(labelT)
         .where(and(eq(labelT.groupId, groupId), notInArray(labelT.id, [labelId])));
      const siblingIds = siblings.map((s) => s.id);
      if (siblingIds.length) {
         await db
            .delete(issueLabel)
            .where(and(eq(issueLabel.issueId, id), inArray(issueLabel.labelId, siblingIds)));
      }
   }

   const inserted = await db
      .insert(issueLabel)
      .values({ issueId: id, labelId })
      .onConflictDoNothing()
      .returning({ labelId: issueLabel.labelId });
   // grava no histórico só quando o vínculo é novo (re-add idempotente não gera evento)
   if (inserted.length > 0) {
      const actor = await getOrCreateUser(db, actorEmail);
      await db.insert(activityEvent).values({
         id: randomUUID(),
         issueId: id,
         actorId: actor.id,
         event: 'label',
         text: `added label ${labelRows[0].name}`,
         createdAt: new Date(),
      });
   }
   publish({ entity: 'issue', action: 'updated', id });
   return getIssue(db, id);
}

export async function removeLabel(
   db: Db,
   id: string,
   labelId: string,
   actorEmail: string
): Promise<IssueDto | null> {
   const deleted = await db
      .delete(issueLabel)
      .where(and(eq(issueLabel.issueId, id), eq(issueLabel.labelId, labelId)))
      .returning({ labelId: issueLabel.labelId });
   // grava no histórico só quando havia vínculo (delete no-op não gera evento)
   if (deleted.length > 0) {
      const labelRows = await db
         .select({ name: labelT.name })
         .from(labelT)
         .where(eq(labelT.id, labelId))
         .limit(1);
      const actor = await getOrCreateUser(db, actorEmail);
      await db.insert(activityEvent).values({
         id: randomUUID(),
         issueId: id,
         actorId: actor.id,
         event: 'label',
         text: `removed label ${labelRows[0]?.name ?? labelId}`,
         createdAt: new Date(),
      });
   }
   publish({ entity: 'issue', action: 'updated', id });
   return getIssue(db, id);
}
