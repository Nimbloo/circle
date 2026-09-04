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
   issueAssignee,
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
import { projectDescriptionDoc } from './description-doc';
import type { EditorDoc } from '@/lib/editor-doc';
import { intersectScopes, teamDescendantIds } from './hierarchy';

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
   /** Conjunto completo de responsáveis (#96): o principal (`assignee`) primeiro,
    *  depois os colaboradores por ordem de adição. Vazio = sem responsável. */
   assignees: UserRef[];
   createdBy: UserRef | null;
   project: ProjectRef | null;
   cycleId: string; // '' = sem ciclo (paridade com o front)
   labels: LabelRow[];
   rank: string;
   dueDate: string | null;
   estimate: number | null;
   /** Rollup de sub-issues (paridade Linear): total de filhas DIRETAS e quantas concluídas. */
   subIssueCount: number;
   subIssueDoneCount: number;
   /** Pai canônico (#95): id + identifier (p/ o chip na linha sem depender do store). null = topo. */
   parentId: string | null;
   parentIdentifier: string | null;
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
   /**
    * Escopo explícito de times (#100): sub-times expandidos e/ou escopo de Guest.
    * Interage com `team` por INTERSEÇÃO; `[]` significa "nada visível".
    */
   teamIds?: string[];
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

/** Status default de issue nova (sub-issue criada sem status): 1º 'unstarted' por posição. */
function defaultStatusId(cat: CatalogMaps): string | undefined {
   const byCategory = (category: string) =>
      [...cat.statuses.values()]
         .filter((s) => s.category === category)
         .sort((a, b) => a.position - b.position)[0]?.id;
   return byCategory('unstarted') ?? byCategory('backlog');
}

/** Teto de profundidade ao subir a árvore de pais (dados legados podem ter ciclo). */
const MAX_PARENT_DEPTH = 64;

/** Ids dos ancestrais de `id` (pai, avô, …), de baixo pra cima. */
async function ancestorIds(db: Db, id: string): Promise<string[]> {
   const out: string[] = [];
   let cur: string | null = id;
   for (let depth = 0; cur && depth < MAX_PARENT_DEPTH; depth++) {
      const rows: { parentId: string | null }[] = await db
         .select({ parentId: issue.parentId })
         .from(issue)
         .where(eq(issue.id, cur))
         .limit(1);
      cur = rows[0]?.parentId ?? null;
      if (!cur || out.includes(cur)) break;
      out.push(cur);
   }
   return out;
}

/**
 * Valida a troca de pai de `id` para `parentId` (#95): o pai existe, não é a própria
 * issue e não é descendente dela (senão fecha ciclo). Retorna a linha do pai.
 */
async function resolveParent(
   db: Db,
   id: string,
   parentId: string
): Promise<typeof issue.$inferSelect> {
   if (parentId === id) throw new ApiError(400, 'Uma issue não pode ser pai de si mesma');
   const rows = await db.select().from(issue).where(eq(issue.id, parentId)).limit(1);
   if (rows.length === 0) throw new ApiError(400, `Issue-pai '${parentId}' não existe`);
   if ((await ancestorIds(db, parentId)).includes(id))
      throw new ApiError(400, 'Uma issue não pode virar filha de uma descendente (ciclo)');
   return rows[0];
}

/** Expande categorias (statusType) para os statusIds correspondentes. */
function statusIdsForCategories(cats: string[], statuses: Map<string, StatusRow>): string[] {
   const set = new Set(cats);
   return [...statuses.values()].filter((s) => set.has(s.category)).map((s) => s.id);
}

/** Subquery: ids das issues em que QUALQUER um dos usuários é responsável (junção). */
function assignedIssueIds(db: Db, userIds: string[]) {
   return db
      .select({ id: issueAssignee.issueId })
      .from(issueAssignee)
      .where(inArray(issueAssignee.userId, userIds));
}

/** Normaliza um conjunto de responsáveis: sem vazios, sem repetição, ordem preservada. */
function normalizeAssigneeIds(ids: readonly (string | null | undefined)[]): string[] {
   return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function buildWhere(
   db: Db,
   opts: IssueFilter,
   statuses: Map<string, StatusRow>,
   meId?: string
): SQL | undefined {
   const conds: SQL[] = [];
   if (opts.team) conds.push(eq(issue.teamId, opts.team));
   if (opts.teamIds)
      conds.push(opts.teamIds.length ? inArray(issue.teamId, opts.teamIds) : sql`false`);
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
      // `me` é resolvido em `assigneeMe` (parseIssueListOptions) — não é um id.
      const ids = opts.assignee.filter((a) => a !== 'unassigned' && a !== 'me');
      const parts: SQL[] = [];
      // Casa QUALQUER responsável (principal ou colaborador) via junção (#96).
      if (ids.length) parts.push(inArray(issue.id, assignedIssueIds(db, ids)));
      // Sem responsável = principal nulo (o principal é derivado do conjunto: vazio ⇔ null).
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
   if (opts.assigneeMe && meId) conds.push(inArray(issue.id, assignedIssueIds(db, [meId])));
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
   // Conjunto de responsáveis (#96): carregado antes para resolver todos os usuários
   // (principal, colaboradores, criador) num único batch. Ordem = ordem de adição.
   const assigneeLinks = await db
      .select({ issueId: issueAssignee.issueId, userId: issueAssignee.userId })
      .from(issueAssignee)
      .where(inArray(issueAssignee.issueId, issueIds))
      .orderBy(asc(issueAssignee.createdAt));
   const assigneeIdsByIssue = new Map<string, string[]>();
   for (const link of assigneeLinks) {
      const arr = assigneeIdsByIssue.get(link.issueId) ?? [];
      arr.push(link.userId);
      assigneeIdsByIssue.set(link.issueId, arr);
   }
   const userIds = [
      ...new Set([
         ...(rows.flatMap((r) => [r.assigneeId, r.createdById]).filter(Boolean) as string[]),
         ...assigneeLinks.map((l) => l.userId),
      ]),
   ];
   const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean) as string[])];
   const parentIds = [...new Set(rows.map((r) => r.parentId).filter(Boolean) as string[])];

   const [users, projects, labelLinks, childAgg, parents] = await Promise.all([
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
      // Rollup de filhas DIRETAS numa query só (GROUP BY parent_id, status_id): a
      // categoria do status resolve "done" pelo catálogo em memória.
      db
         .select({ parentId: issue.parentId, statusId: issue.statusId, n: sql<number>`count(*)` })
         .from(issue)
         .where(inArray(issue.parentId, issueIds))
         .groupBy(issue.parentId, issue.statusId),
      parentIds.length
         ? db
              .select({ id: issue.id, identifier: issue.identifier })
              .from(issue)
              .where(inArray(issue.id, parentIds))
         : Promise.resolve([]),
   ]);
   const userMap = new Map(users.map((u) => [u.id, u]));
   const projectMap = new Map(projects.map((p) => [p.id, p]));
   const parentMap = new Map(parents.map((p) => [p.id, p.identifier]));
   const labelsByIssue = new Map<string, LabelRow[]>();
   for (const link of labelLinks) {
      const lbl = cat.labels.get(link.labelId);
      if (!lbl) continue;
      const arr = labelsByIssue.get(link.issueId) ?? [];
      arr.push(lbl);
      labelsByIssue.set(link.issueId, arr);
   }

   // done = filhas em status da categoria 'completed'.
   const rollup = new Map<string, { count: number; done: number }>();
   for (const row of childAgg) {
      if (!row.parentId) continue;
      const agg = rollup.get(row.parentId) ?? { count: 0, done: 0 };
      const n = Number(row.n);
      agg.count += n;
      if (cat.statuses.get(row.statusId)?.category === 'completed') agg.done += n;
      rollup.set(row.parentId, agg);
   }

   return rows.map((r) => ({
      id: r.id,
      identifier: r.identifier,
      teamId: r.teamId,
      title: r.title,
      status: cat.statuses.get(r.statusId)!,
      priority: cat.priorities.get(r.priorityId)!,
      assignee: userRef(r.assigneeId ? userMap.get(r.assigneeId) : undefined),
      // Principal primeiro, depois os colaboradores por ordem de adição.
      assignees: normalizeAssigneeIds([r.assigneeId, ...(assigneeIdsByIssue.get(r.id) ?? [])])
         .map((uid) => userRef(userMap.get(uid)))
         .filter((u): u is UserRef => u !== null),
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
      parentId: r.parentId ?? null,
      parentIdentifier: r.parentId ? (parentMap.get(r.parentId) ?? null) : null,
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
   // Sub-times (#100): filtrar pelo time pai inclui os filhos. A expansão é
   // server-side e converge no mesmo `teamIds` usado pelo escopo de Guest.
   if (opts.team) {
      const expanded = await teamDescendantIds(db, [opts.team]);
      opts = { ...opts, team: undefined, teamIds: intersectScopes(opts.teamIds, expanded) };
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
   /** Obrigatório sem `parentId`; com pai, herda o time dele quando omitido. */
   teamId?: string;
   title: string;
   /** Omitido → 1º status da categoria 'unstarted' (default de issue nova). */
   statusId?: string;
   /** Obrigatório sem `parentId`; com pai, herda a prioridade dele quando omitido. */
   priorityId?: string;
   /**
    * Cria já como sub-issue (#95), atomicamente. Herda `teamId`/`priorityId`/`projectId`
    * do pai quando não informados; `cycleId` do pai se o cycle estiver `current`; labels
    * NÃO herdam; assignee herda só se o criador é o assignee do pai.
    */
   parentId?: string | null;
   assigneeId?: string | null;
   /** Conjunto de responsáveis (#96). Tem precedência sobre `assigneeId`; o primeiro é o principal. */
   assigneeIds?: string[];
   projectId?: string | null;
   cycleId?: string | null;
   labelIds?: string[];
   dueDate?: string | null;
   estimate?: number | null;
   description?: string | null;
   /** Doc do editor de blocos (#16): tem precedência — o servidor deriva `description`. */
   descriptionDoc?: EditorDoc | null;
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
   const catalogs = await loadCatalogs(db);

   // Sub-issue (#95): resolve o pai e herda dele o que o cliente não informou.
   let parent: typeof issue.$inferSelect | null = null;
   if (input.parentId) {
      const rows = await db.select().from(issue).where(eq(issue.id, input.parentId)).limit(1);
      if (rows.length === 0) throw new ApiError(400, `Issue-pai '${input.parentId}' não existe`);
      parent = rows[0];
   }
   const teamId = input.teamId ?? parent?.teamId;
   if (!teamId) throw new ApiError(400, 'teamId é obrigatório');
   const priorityId = input.priorityId ?? parent?.priorityId;
   if (!priorityId) throw new ApiError(400, 'priorityId é obrigatório');
   const statusId = input.statusId ?? defaultStatusId(catalogs);
   if (!statusId) throw new ApiError(400, 'statusId é obrigatório');
   const projectId =
      input.projectId !== undefined ? (input.projectId ?? null) : (parent?.projectId ?? null);
   let cycleId: string | null = input.cycleId || null;
   if (input.cycleId === undefined && parent?.cycleId) {
      const [cyc] = await db
         .select({ status: cycleT.status })
         .from(cycleT)
         .where(eq(cycleT.id, parent.cycleId))
         .limit(1);
      if (cyc?.status === 'current') cycleId = parent.cycleId;
   }
   const assigneeId =
      input.assigneeId !== undefined
         ? (input.assigneeId ?? null)
         : parent && parent.assigneeId === actor.id
           ? actor.id
           : null;

   const teamRows = await db.select().from(teamT).where(eq(teamT.id, teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(400, `Team '${teamId}' não existe`);

   // valida FKs de catálogo antes do insert (senão a FK estoura como 500). Usa o cache
   // de catálogos (memoizado, TTL 30s) em vez de 2 SELECTs por criação de issue.
   const statusRow = catalogs.statuses.get(statusId);
   if (!statusRow) throw new ApiError(400, `Status '${statusId}' não existe`);
   // Marcos temporais quando a issue já nasce started/completed (cycle/lead time).
   const startCat = statusRow.category;
   if (!catalogs.priorities.get(priorityId))
      throw new ApiError(400, `Priority '${priorityId}' não existe`);

   // Descrição: o doc do editor (derivando a projeção em texto, 400 se inválido) ou o
   // texto puro do cliente antigo.
   const content =
      input.descriptionDoc !== undefined
         ? projectDescriptionDoc(input.descriptionDoc)
         : { text: input.description || null, doc: null };

   const id = randomUUID();
   const now = new Date();
   // Responsáveis: `assigneeIds` (conjunto; o 1º é o principal) ou o `assigneeId` legado.
   const assigneeIds = normalizeAssigneeIds(input.assigneeIds ?? (assigneeId ? [assigneeId] : []));
   const principalId = assigneeIds[0] ?? null;

   // Atômico: incremento do contador + issue + content + labels + evento.
   await db.transaction(async (tx) => {
      // identifier: incremento atômico do contador do time
      const seqRes = await tx
         .update(teamT)
         .set({ issueSeq: sql`${teamT.issueSeq} + 1` })
         .where(eq(teamT.id, teamId))
         .returning({ seq: teamT.issueSeq });
      const identifier = `${teamId}-${seqRes[0].seq}`;

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
         teamId,
         title: input.title,
         statusId,
         priorityId,
         assigneeId: principalId,
         createdById: actor.id,
         projectId,
         cycleId,
         parentId: parent?.id ?? null,
         rank,
         dueDate: input.dueDate ?? null,
         estimate: input.estimate ?? null,
         sentryIssueId: input.sentryIssueId ?? null,
         startedAt: startCat === 'started' || startCat === 'completed' ? now : null,
         completedAt: startCat === 'completed' ? now : null,
         createdAt: now,
         updatedAt: now,
      });

      if (content.text) {
         await tx.insert(issueContent).values({
            issueId: id,
            description: content.text,
            descriptionDoc: content.doc,
            milestone: null,
         });
      }
      if (input.labelIds?.length) {
         await tx
            .insert(issueLabel)
            .values(input.labelIds.map((labelId) => ({ issueId: id, labelId })))
            .onConflictDoNothing();
      }
      const events = [{ event: 'created', text: 'created the issue' }];
      if (parent) events.push({ event: 'parent', text: `set parent to ${parent.identifier}` });
      await tx.insert(activityEvent).values(
         events.map((e) => ({
            id: randomUUID(),
            issueId: id,
            actorId: actor.id,
            event: e.event,
            text: e.text,
            createdAt: now,
         }))
      );

      if (assigneeIds.length) {
         await tx
            .insert(issueAssignee)
            .values(assigneeIds.map((userId) => ({ issueId: id, userId, createdAt: now })))
            .onConflictDoNothing();
      }

      // auto-subscribe (Linear-style): criador + todos os responsáveis iniciais
      const subscribers = new Set<string>([actor.id, ...assigneeIds]);
      await tx
         .insert(issueSubscription)
         .values([...subscribers].map((userId) => ({ issueId: id, userId })))
         .onConflictDoNothing();
   });

   publish({ entity: 'issue', action: 'created', id, actorEmail });
   // O rollup do pai mudou (nova filha) → o board atualiza a linha dele.
   if (parent) publish({ entity: 'issue', action: 'updated', id: parent.id, actorEmail });
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
   /** Troca só o PRINCIPAL e mantém os colaboradores (`""`/null desatribui o principal). */
   assigneeId?: string | null;
   /** Substitui o CONJUNTO de responsáveis (#96); o 1º vira o principal. `[]` limpa todos. */
   assigneeIds?: string[];
   projectId?: string | null;
   cycleId?: string | null;
   dueDate?: string | null;
   estimate?: number | null;
   /** Snooze de triage: ISO para adiar, null para reativar. */
   snoozedUntil?: string | null;
   /** Milestone estruturada (FK project_milestone) ou null p/ remover. */
   milestoneId?: string | null;
   /** Pai canônico (#95): id p/ mover/virar sub-issue, null p/ remover o pai. */
   parentId?: string | null;
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

   // Responsáveis (#96): `assigneeIds` substitui o conjunto; `assigneeId` sozinho troca só
   // o principal e mantém os colaboradores (`""` → sem principal, como cycleId). O
   // principal gravado em `issue.assignee_id` é SEMPRE o 1º do conjunto resultante.
   let nextAssigneeIds: string[] | null = null;
   let prevAssigneeIds: string[] = [];
   if (patch.assigneeIds !== undefined || patch.assigneeId !== undefined) {
      const links = await db
         .select({ userId: issueAssignee.userId })
         .from(issueAssignee)
         .where(eq(issueAssignee.issueId, id))
         .orderBy(asc(issueAssignee.createdAt));
      prevAssigneeIds = normalizeAssigneeIds([prev.assigneeId, ...links.map((l) => l.userId)]);
      nextAssigneeIds =
         patch.assigneeIds !== undefined
            ? normalizeAssigneeIds(patch.assigneeIds)
            : normalizeAssigneeIds([
                 patch.assigneeId || null,
                 ...prevAssigneeIds.filter((u) => u !== prev.assigneeId),
              ]);
   }
   const addedAssigneeIds = nextAssigneeIds
      ? nextAssigneeIds.filter((u) => !prevAssigneeIds.includes(u))
      : [];
   const removedAssigneeIds = nextAssigneeIds
      ? prevAssigneeIds.filter((u) => !nextAssigneeIds!.includes(u))
      : [];
   const nextPrincipalId = nextAssigneeIds ? (nextAssigneeIds[0] ?? null) : prev.assigneeId;
   const principalChanged = nextPrincipalId !== prev.assigneeId;

   const set: Record<string, unknown> = { updatedAt: new Date() };
   if (patch.title !== undefined) set.title = patch.title;
   if (patch.statusId !== undefined) set.statusId = patch.statusId;
   if (patch.priorityId !== undefined) set.priorityId = patch.priorityId;
   if (nextAssigneeIds) set.assigneeId = nextPrincipalId;
   // `""` (limpar o campo) → null, consistente com cycleId: senão a FK vira 404
   // "recurso não existe" em vez de desvincular.
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

   // Pai (#95): "" limpa como os demais FKs; guarda de auto-pai e de ciclo em resolveParent.
   const nextParentId = patch.parentId !== undefined ? patch.parentId || null : undefined;
   let newParent: typeof issue.$inferSelect | null = null;
   if (nextParentId !== undefined && nextParentId !== prev.parentId) {
      if (nextParentId) newParent = await resolveParent(db, id, nextParentId);
      set.parentId = nextParentId;
   }

   // Transição de status: marcos temporais (cycle/lead time) + auto-add ao cycle.
   let enteredCompleted = false;
   const prevCategory = (await loadCatalogs(db)).statuses.get(prev.statusId)?.category;
   let nextCategory = prevCategory;
   if (patch.statusId !== undefined && patch.statusId !== prev.statusId) {
      const cat = (await loadCatalogs(db)).statuses.get(patch.statusId)?.category;
      nextCategory = cat;
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

   // Atômico com a junção de responsáveis: o principal em `issue` e o conjunto em
   // `issue_assignee` nunca ficam inconsistentes entre si.
   await db.transaction(async (tx) => {
      await tx.update(issue).set(set).where(eq(issue.id, id));
      if (removedAssigneeIds.length) {
         await tx
            .delete(issueAssignee)
            .where(
               and(eq(issueAssignee.issueId, id), inArray(issueAssignee.userId, removedAssigneeIds))
            );
      }
      if (addedAssigneeIds.length) {
         await tx
            .insert(issueAssignee)
            .values(
               addedAssigneeIds.map((userId) => ({
                  issueId: id,
                  userId,
                  createdAt: set.updatedAt as Date,
               }))
            )
            .onConflictDoNothing();
      }
   });

   // Nomes p/ o histórico "added/removed assignee X" (um SELECT só quando houve mudança).
   const changedAssigneeIds = [...addedAssigneeIds, ...removedAssigneeIds];
   const assigneeNames = new Map<string, string>(
      changedAssigneeIds.length
         ? (
              await db
                 .select({ id: appUser.id, name: appUser.name })
                 .from(appUser)
                 .where(inArray(appUser.id, changedAssigneeIds))
           ).map((u) => [u.id, u.name])
         : []
   );

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
   // Entradas/saídas do conjunto têm evento por pessoa; "changed assignee" fica só para
   // a troca de principal sem ninguém entrar/sair (ex.: promover um colaborador).
   if (principalChanged && !addedAssigneeIds.length && !removedAssigneeIds.length)
      events.push({ event: 'assignee', text: `changed assignee` });
   for (const uid of addedAssigneeIds)
      events.push({ event: 'assignee', text: `added assignee ${assigneeNames.get(uid) ?? uid}` });
   for (const uid of removedAssigneeIds)
      events.push({ event: 'assignee', text: `removed assignee ${assigneeNames.get(uid) ?? uid}` });
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
   if (set.parentId !== undefined)
      events.push({
         event: 'parent',
         text: newParent ? `set parent to ${newParent.identifier}` : 'removed parent',
      });
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

   // CADA novo responsável: auto-subscribe (Linear-style; inclui auto-atribuição) e
   // notificação (in-app + Slack/Email best-effort) — exceto o próprio ator.
   for (const uid of addedAssigneeIds) {
      await subscribeToIssue(db, id, uid);
      if (uid === actor.id) continue;
      // Fire-and-forget: notificação (Slack/SES) não bloqueia a resposta do PATCH.
      // `dispatchNotification` captura os próprios erros (loga, não lança).
      void dispatchNotification(db, {
         type: 'assignment',
         issueId: id,
         recipientId: uid,
         actorId: actor.id,
         content: `${actor.name} atribuiu esta issue a você`,
      });
   }

   // Automações de sub-issues (#95): só quando o status trocou de CATEGORIA.
   if (prevCategory !== nextCategory && patch.statusId !== undefined) {
      await applyAutoClose(
         db,
         {
            id,
            teamId: prev.teamId,
            statusId: patch.statusId,
            parentId: set.parentId !== undefined ? (set.parentId as string | null) : prev.parentId,
         },
         actor.id,
         actorEmail
      );
   }

   publish({ entity: 'issue', action: 'updated', id, actorEmail });
   // Rollup dos pais (antigo e novo) mudou quando a issue trocou de pai ou de status.
   const parentsToRefresh = new Set<string>();
   if (set.parentId !== undefined) {
      if (prev.parentId) parentsToRefresh.add(prev.parentId);
      if (newParent) parentsToRefresh.add(newParent.id);
   } else if (prev.parentId && patch.statusId !== undefined && patch.statusId !== prev.statusId) {
      parentsToRefresh.add(prev.parentId);
   }
   for (const pid of parentsToRefresh) publish({ entity: 'issue', action: 'updated', id: pid });
   const dto = await getIssue(db, id);
   // Feed do canal Slack (best-effort, fire-and-forget). Gated pelo slack_config admin.
   if (dto) {
      if (enteredCompleted)
         void notifySlackEvent(db, {
            type: 'issue.completed',
            identifier: dto.identifier,
            title: dto.title,
         });
      const assignedNow = principalChanged && nextPrincipalId !== null;
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

/**
 * Automações de sub-issues (#95), por time:
 * - `auto_close_parent`: a última filha concluída/cancelada conclui o pai (sobe a árvore
 *   enquanto a regra continuar valendo);
 * - `auto_close_children`: pai concluído conclui as filhas ainda abertas (desce a árvore).
 * Cada issue tocada ganha activity `status` (texto explicando a automação) e evento realtime.
 */
async function applyAutoClose(
   db: Db,
   changed: { id: string; teamId: string; statusId: string; parentId: string | null },
   actorId: string,
   actorEmail: string
): Promise<void> {
   const [flags] = await db
      .select({ parent: teamT.autoCloseParent, children: teamT.autoCloseChildren })
      .from(teamT)
      .where(eq(teamT.id, changed.teamId))
      .limit(1);
   if (!flags || (!flags.parent && !flags.children)) return;
   const cat = await loadCatalogs(db);
   const categoryOf = (statusId: string) => cat.statuses.get(statusId)?.category;
   const isDone = (statusId: string) => {
      const c = categoryOf(statusId);
      return c === 'completed' || c === 'canceled';
   };
   const completedStatusId =
      categoryOf(changed.statusId) === 'completed'
         ? changed.statusId
         : [...cat.statuses.values()]
              .filter((s) => s.category === 'completed')
              .sort((a, b) => a.position - b.position)[0]?.id;
   if (!completedStatusId) return;

   const close = async (
      target: { id: string; statusId: string; startedAt: Date | null },
      text: string
   ) => {
      const now = new Date();
      await db
         .update(issue)
         .set({
            statusId: completedStatusId,
            completedAt: now,
            startedAt: target.startedAt ?? now,
            updatedAt: now,
         })
         .where(eq(issue.id, target.id));
      await db.insert(activityEvent).values({
         id: randomUUID(),
         issueId: target.id,
         actorId,
         event: 'status',
         text,
         createdAt: now,
      });
      publish({ entity: 'issue', action: 'updated', id: target.id, actorEmail });
   };

   // Sobe: a issue ficou done → se TODAS as irmãs também, conclui o pai; repete acima.
   if (flags.parent && isDone(changed.statusId)) {
      let parentId = changed.parentId;
      for (let depth = 0; parentId && depth < MAX_PARENT_DEPTH; depth++) {
         const [parent] = await db.select().from(issue).where(eq(issue.id, parentId)).limit(1);
         if (!parent || isDone(parent.statusId)) break;
         const siblings = await db
            .select({ statusId: issue.statusId })
            .from(issue)
            .where(eq(issue.parentId, parent.id));
         if (!siblings.every((s) => isDone(s.statusId))) break;
         await close(parent, 'completed automatically: all sub-issues are done');
         parentId = parent.parentId;
      }
   }

   // Desce: a issue foi concluída → conclui as filhas (e netas) ainda abertas.
   if (flags.children && categoryOf(changed.statusId) === 'completed') {
      const queue = [changed.id];
      const seen = new Set<string>();
      while (queue.length) {
         const pid = queue.shift()!;
         if (seen.has(pid)) continue;
         seen.add(pid);
         const children = await db.select().from(issue).where(eq(issue.parentId, pid));
         for (const child of children) {
            if (!isDone(child.statusId))
               await close(child, 'completed automatically: parent issue was completed');
            queue.push(child.id);
         }
      }
   }
}

export async function deleteIssue(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: issue.id }).from(issue).where(eq(issue.id, id)).limit(1);
   if (existing.length === 0) return false;
   const children = await db.select({ id: issue.id }).from(issue).where(eq(issue.parentId, id));

   // Atômico: limpa todas as dependências (FKs) antes de remover a issue.
   await db.transaction(async (tx) => {
      // Filhas ficam órfãs de pai (voltam ao topo) em vez de relação pendurada.
      await tx.update(issue).set({ parentId: null }).where(eq(issue.parentId, id));
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
      await tx.delete(issueAssignee).where(eq(issueAssignee.issueId, id));
      await tx.delete(issueSubscription).where(eq(issueSubscription.issueId, id));
      await tx.delete(issueContent).where(eq(issueContent.issueId, id));
      await tx.delete(issue).where(eq(issue.id, id));
   });
   publish({ entity: 'issue', action: 'deleted', id });
   for (const c of children) publish({ entity: 'issue', action: 'updated', id: c.id });
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
