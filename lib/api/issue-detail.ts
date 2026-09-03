import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   issue as issueT,
   issueContent,
   issueRelation,
   issuePrLink,
   comment as commentT,
   commentReaction,
   activityEvent,
   issueSubscription,
   projectMilestone,
   appUser,
} from '@/db/schema';
import { getOrCreateUser } from './users';
import { dispatchNotification } from './notify';
import { ApiError } from './errors';
import { publish } from './events';
import type { UserRef } from './issues';
import { projectDescriptionDoc } from './description-doc';
import type { EditorDoc } from '@/lib/editor-doc';

function userRef(
   u:
      | { id: string; slug: string; name: string; email: string; avatarUrl: string | null }
      | undefined
): UserRef | null {
   return u
      ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
      : null;
}

export interface ReactionDto {
   emoji: string;
   count: number;
   /** true se o USUÁRIO ATUAL reagiu com este emoji (server-truth p/ o toggle). */
   reactedByMe: boolean;
}

export interface CommentDto {
   id: string;
   author: UserRef | null;
   body: string;
   parentId: string | null;
   createdAt: string;
   reactions: ReactionDto[];
}

export interface ActivityItem {
   kind: 'event' | 'comment';
   id: string;
   actor: UserRef | null;
   createdAt: string;
   event?: string;
   text?: string;
   body?: string;
   parentId?: string | null;
   reactions?: ReactionDto[];
}

export interface IssueDetailDto {
   identifier: string;
   /** Projeção em texto (markdown) da descrição — busca, API antiga, e-mails. */
   description: string | null;
   /** Documento do editor de blocos (JSON do ProseMirror). null = só há a projeção. */
   descriptionDoc: EditorDoc | null;
   /** Milestone livre (legado). Novo fluxo usa milestoneId/milestoneName estruturados. */
   milestone: string | null;
   /** Milestone estruturada (FK project_milestone) + nome resolvido. */
   milestoneId: string | null;
   milestoneName: string | null;
   subIssueIds: string[];
   relatedIds: string[];
   blockedByIds: string[];
   /** Issues que ESTA bloqueia (lado inverso de blocked_by — paridade Linear "Blocks"). */
   blockingIds: string[];
   duplicateIds: string[];
   prLinks: { id: string; title: string; status: string }[];
}

async function loadUsers(db: Db, ids: string[]) {
   const uniq = [...new Set(ids.filter(Boolean))];
   if (uniq.length === 0) return new Map<string, typeof appUser.$inferSelect>();
   const rows = await db.select().from(appUser).where(inArray(appUser.id, uniq));
   return new Map(rows.map((u) => [u.id, u]));
}

async function reactionsByComment(db: Db, commentIds: string[], meUserId?: string) {
   const map = new Map<string, ReactionDto[]>();
   if (commentIds.length === 0) return map;
   const rows = await db
      .select()
      .from(commentReaction)
      .where(inArray(commentReaction.commentId, commentIds));
   const agg = new Map<string, Map<string, { count: number; reactedByMe: boolean }>>();
   for (const r of rows) {
      const byEmoji =
         agg.get(r.commentId) ?? new Map<string, { count: number; reactedByMe: boolean }>();
      const cur = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
      cur.count += 1;
      if (meUserId && r.userId === meUserId) cur.reactedByMe = true;
      byEmoji.set(r.emoji, cur);
      agg.set(r.commentId, byEmoji);
   }
   for (const [cid, byEmoji] of agg)
      map.set(
         cid,
         [...byEmoji.entries()].map(([emoji, { count, reactedByMe }]) => ({
            emoji,
            count,
            reactedByMe,
         }))
      );
   return map;
}

export async function getIssueDetail(db: Db, issueId: string): Promise<IssueDetailDto | null> {
   const rows = await db.select().from(issueT).where(eq(issueT.id, issueId)).limit(1);
   if (rows.length === 0) return null;
   const iss = rows[0];
   const [content, relations, blocking, prs, ms] = await Promise.all([
      db.select().from(issueContent).where(eq(issueContent.issueId, issueId)).limit(1),
      db.select().from(issueRelation).where(eq(issueRelation.issueId, issueId)),
      // Lado inverso: outras issues que declaram ESTA como blocked_by → ESTA as bloqueia.
      db
         .select({ issueId: issueRelation.issueId })
         .from(issueRelation)
         .where(and(eq(issueRelation.relatedId, issueId), eq(issueRelation.kind, 'blocked_by'))),
      db.select().from(issuePrLink).where(eq(issuePrLink.issueId, issueId)),
      iss.milestoneId
         ? db
              .select({ id: projectMilestone.id, name: projectMilestone.name })
              .from(projectMilestone)
              .where(eq(projectMilestone.id, iss.milestoneId))
              .limit(1)
         : Promise.resolve([]),
   ]);
   return {
      identifier: iss.identifier,
      description: content[0]?.description ?? null,
      descriptionDoc: (content[0]?.descriptionDoc as EditorDoc | null | undefined) ?? null,
      milestone: content[0]?.milestone ?? null,
      milestoneId: iss.milestoneId ?? null,
      milestoneName: ms[0]?.name ?? null,
      subIssueIds: relations.filter((r) => r.kind === 'sub').map((r) => r.relatedId),
      relatedIds: relations.filter((r) => r.kind === 'related').map((r) => r.relatedId),
      blockedByIds: relations.filter((r) => r.kind === 'blocked_by').map((r) => r.relatedId),
      blockingIds: blocking.map((b) => b.issueId),
      duplicateIds: relations.filter((r) => r.kind === 'duplicate').map((r) => r.relatedId),
      prLinks: prs.map((p) => ({ id: p.id, title: p.title, status: p.status })),
   };
}

export interface UpdateIssueContentInput {
   /** Texto cru (cliente antigo): grava a projeção e ZERA o doc. */
   description?: string | null;
   /** Doc do editor: grava o doc e DERIVA a projeção em texto. Tem precedência. */
   descriptionDoc?: EditorDoc | null;
   milestone?: string | null;
}

/** Upsert da descrição (doc do editor + projeção em texto) da issue em `issue_content`.
 * Retorna o detail atualizado. */
export async function updateIssueContent(
   db: Db,
   issueId: string,
   patch: UpdateIssueContentInput
): Promise<IssueDetailDto | null> {
   const exists = await db
      .select({ id: issueT.id })
      .from(issueT)
      .where(eq(issueT.id, issueId))
      .limit(1);
   if (exists.length === 0) return null;
   // Upsert parcial: só os campos presentes no patch são alterados numa linha existente.
   const set: Partial<typeof issueContent.$inferInsert> = {};
   if (patch.descriptionDoc !== undefined) {
      const derived = projectDescriptionDoc(patch.descriptionDoc);
      set.description = derived.text;
      set.descriptionDoc = derived.doc;
   } else if (patch.description !== undefined) {
      set.description = patch.description;
      set.descriptionDoc = null;
   }
   if (patch.milestone !== undefined) set.milestone = patch.milestone;
   await db
      .insert(issueContent)
      .values({
         issueId,
         description: set.description ?? null,
         descriptionDoc: set.descriptionDoc ?? null,
         milestone: patch.milestone ?? null,
      })
      .onConflictDoUpdate({ target: issueContent.issueId, set });
   publish({ entity: 'issue', action: 'updated', id: issueId });
   return getIssueDetail(db, issueId);
}

export type RelationKind = 'sub' | 'related' | 'blocked_by' | 'duplicate';
export const RELATION_KINDS: readonly RelationKind[] = [
   'sub',
   'related',
   'blocked_by',
   'duplicate',
];

/** Evento de atividade (event, text) para add/remove de cada tipo de relação. O feed
 * já tem ícones para related/blocked/unblocked; sub cai no ícone default. */
function relationEvent(kind: RelationKind, added: boolean): { event: string; text: string } {
   if (kind === 'blocked_by')
      return added
         ? { event: 'blocked', text: 'marcou como bloqueada' }
         : { event: 'unblocked', text: 'removeu um bloqueio' };
   if (kind === 'sub')
      return added
         ? { event: 'sub', text: 'adicionou uma sub-issue' }
         : { event: 'sub', text: 'removeu uma sub-issue' };
   if (kind === 'duplicate')
      return added
         ? { event: 'duplicate', text: 'marcou como duplicada' }
         : { event: 'duplicate', text: 'removeu a marca de duplicada' };
   return added
      ? { event: 'related', text: 'vinculou uma issue relacionada' }
      : { event: 'related', text: 'removeu uma issue relacionada' };
}

async function recordRelationEvent(
   db: Db,
   issueId: string,
   kind: RelationKind,
   added: boolean,
   actorEmail?: string
): Promise<void> {
   if (!actorEmail) return;
   const actor = await getOrCreateUser(db, actorEmail);
   const { event, text } = relationEvent(kind, added);
   await db.insert(activityEvent).values({
      id: randomUUID(),
      issueId,
      actorId: actor.id,
      event,
      text,
      createdAt: new Date(),
   });
}

/** Cria uma relação issueId -> relatedId (idempotente). Retorna o detail atualizado. */
export async function addRelation(
   db: Db,
   issueId: string,
   relatedId: string,
   kind: RelationKind,
   actorEmail?: string
): Promise<IssueDetailDto | null> {
   if (issueId === relatedId)
      throw new ApiError(400, 'Uma issue não pode se relacionar consigo mesma');
   const [a, b] = await Promise.all([
      db.select({ id: issueT.id }).from(issueT).where(eq(issueT.id, issueId)).limit(1),
      db.select({ id: issueT.id }).from(issueT).where(eq(issueT.id, relatedId)).limit(1),
   ]);
   if (a.length === 0) return null;
   if (b.length === 0) throw new ApiError(404, `Issue relacionada '${relatedId}' não existe`);
   const existing = await db
      .select({ id: issueRelation.id })
      .from(issueRelation)
      .where(
         and(
            eq(issueRelation.issueId, issueId),
            eq(issueRelation.relatedId, relatedId),
            eq(issueRelation.kind, kind)
         )
      )
      .limit(1);
   if (existing.length === 0) {
      await db.insert(issueRelation).values({ id: randomUUID(), issueId, relatedId, kind });
      // trilha no feed só quando o vínculo é novo (re-add idempotente não gera evento)
      await recordRelationEvent(db, issueId, kind, true, actorEmail);
   }
   publish({ entity: 'issue', action: 'updated', id: issueId });
   return getIssueDetail(db, issueId);
}

/** Remove a relação issueId -> relatedId do tipo `kind`. Retorna o detail atualizado. */
export async function removeRelation(
   db: Db,
   issueId: string,
   relatedId: string,
   kind: RelationKind,
   actorEmail?: string
): Promise<IssueDetailDto | null> {
   const deleted = await db
      .delete(issueRelation)
      .where(
         and(
            eq(issueRelation.issueId, issueId),
            eq(issueRelation.relatedId, relatedId),
            eq(issueRelation.kind, kind)
         )
      )
      .returning({ id: issueRelation.id });
   if (deleted.length > 0) await recordRelationEvent(db, issueId, kind, false, actorEmail);
   publish({ entity: 'issue', action: 'updated', id: issueId });
   return getIssueDetail(db, issueId);
}

export async function listComments(
   db: Db,
   issueId: string,
   meEmail?: string
): Promise<CommentDto[]> {
   const comments = await db
      .select()
      .from(commentT)
      .where(eq(commentT.issueId, issueId))
      .orderBy(asc(commentT.createdAt));
   // Resolve o "me" por SELECT read-only — o usuário já está autenticado, não se faz
   // INSERT (getOrCreateUser) num handler de leitura. Não achou → undefined (reactedByMe=false).
   let meUserId: string | undefined;
   if (meEmail) {
      const meRows = await db
         .select({ id: appUser.id })
         .from(appUser)
         .where(eq(appUser.email, meEmail.trim().toLowerCase()))
         .limit(1);
      meUserId = meRows[0]?.id;
   }
   const [users, reactions] = await Promise.all([
      loadUsers(
         db,
         comments.map((c) => c.authorId)
      ),
      reactionsByComment(
         db,
         comments.map((c) => c.id),
         meUserId
      ),
   ]);
   return comments.map((c) => ({
      id: c.id,
      author: userRef(users.get(c.authorId)),
      body: c.body,
      parentId: c.parentId ?? null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      reactions: reactions.get(c.id) ?? [],
   }));
}

export async function addComment(
   db: Db,
   issueId: string,
   body: string,
   actorEmail: string,
   parentId?: string | null
): Promise<CommentDto> {
   const [iss] = await db
      .select({ assigneeId: issueT.assigneeId })
      .from(issueT)
      .where(eq(issueT.id, issueId))
      .limit(1);
   if (!iss) throw new ApiError(404, `Issue '${issueId}' não encontrada`);

   // Threading: valida que o pai existe E é da MESMA issue (sem cross-issue thread).
   // Só um nível de aninhamento — responder a uma resposta ancora no mesmo pai raiz.
   let rootParentId: string | null = null;
   let parentAuthorId: string | null = null;
   if (parentId) {
      const [parent] = await db
         .select({
            id: commentT.id,
            issueId: commentT.issueId,
            parentId: commentT.parentId,
            authorId: commentT.authorId,
         })
         .from(commentT)
         .where(eq(commentT.id, parentId))
         .limit(1);
      if (!parent || parent.issueId !== issueId) throw new ApiError(400, 'Comentário-pai inválido');
      rootParentId = parent.parentId ?? parent.id;
      parentAuthorId = parent.authorId;
   }

   const author = await getOrCreateUser(db, actorEmail);
   const id = randomUUID();
   const now = new Date();
   await db
      .insert(commentT)
      .values({ id, issueId, authorId: author.id, body, parentId: rootParentId, createdAt: now });

   // @mentions: resolve os slugs (prefixo do e-mail) citados no corpo e notifica.
   const slugs = [
      ...new Set((body.match(/@([a-z0-9._-]+)/gi) ?? []).map((m) => m.slice(1).toLowerCase())),
   ];
   const mentioned = slugs.length
      ? await db.select().from(appUser).where(inArray(appUser.slug, slugs))
      : [];
   const mentionedIds = new Set(mentioned.filter((u) => u.id !== author.id).map((u) => u.id));

   // auto-subscribe (Linear-style): quem comenta e quem é mencionado passa a seguir a issue
   await db
      .insert(issueSubscription)
      .values([author.id, ...mentionedIds].map((userId) => ({ issueId, userId })))
      .onConflictDoNothing();

   const notifications: Promise<void>[] = [...mentionedIds].map((recipientId) =>
      dispatchNotification(db, {
         type: 'mention',
         issueId,
         recipientId,
         actorId: author.id,
         content: `${author.name} mencionou você em um comentário`,
      })
   );

   // Notifica o responsável (se não for o próprio autor nem já mencionado acima)
   if (iss.assigneeId && iss.assigneeId !== author.id && !mentionedIds.has(iss.assigneeId)) {
      notifications.push(
         dispatchNotification(db, {
            type: 'comment',
            issueId,
            recipientId: iss.assigneeId,
            actorId: author.id,
            content: `${author.name} comentou nesta issue`,
         })
      );
   }
   // Resposta: notifica o autor do comentário-pai (se não for o próprio autor,
   // nem o assignee/mencionado já notificados acima).
   if (
      parentAuthorId &&
      parentAuthorId !== author.id &&
      parentAuthorId !== iss.assigneeId &&
      !mentionedIds.has(parentAuthorId)
   ) {
      notifications.push(
         dispatchNotification(db, {
            type: 'comment',
            issueId,
            recipientId: parentAuthorId,
            actorId: author.id,
            content: `${author.name} respondeu ao seu comentário`,
         })
      );
   }
   // Fire-and-forget: as notificações (Slack/SES) não bloqueiam a resposta do comentário.
   void Promise.all(notifications).catch((e) =>
      console.error('[circle] notificações de comentário falharam:', e)
   );

   publish({ entity: 'comment', action: 'created', id, actorEmail });
   return {
      id,
      author: userRef(author),
      body,
      parentId: rootParentId,
      createdAt: now.toISOString(),
      reactions: [],
   };
}

/**
 * Edita o corpo de um comentário. Só o AUTOR pode editar (403 caso contrário).
 * Retorna o CommentDto atualizado (autor + reactions) ou null se não existir.
 */
export async function updateComment(
   db: Db,
   commentId: string,
   body: string,
   actorEmail: string
): Promise<CommentDto | null> {
   const rows = await db.select().from(commentT).where(eq(commentT.id, commentId)).limit(1);
   if (rows.length === 0) return null;
   const c = rows[0];
   const actor = await getOrCreateUser(db, actorEmail);
   if (c.authorId !== actor.id) throw new ApiError(403, 'Só o autor pode editar o comentário');
   await db.update(commentT).set({ body }).where(eq(commentT.id, commentId));
   publish({ entity: 'comment', action: 'updated', id: commentId, actorEmail });
   const [users, reactions] = await Promise.all([
      loadUsers(db, [c.authorId]),
      reactionsByComment(db, [commentId]),
   ]);
   return {
      id: c.id,
      author: userRef(users.get(c.authorId)),
      body,
      parentId: c.parentId ?? null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      reactions: reactions.get(c.id) ?? [],
   };
}

/**
 * Exclui um comentário. Só o AUTOR pode excluir (403 caso contrário).
 * Remove antes as reactions (FK). Retorna false se o comentário não existir.
 */
export async function deleteComment(
   db: Db,
   commentId: string,
   actorEmail: string
): Promise<boolean> {
   const rows = await db.select().from(commentT).where(eq(commentT.id, commentId)).limit(1);
   if (rows.length === 0) return false;
   const c = rows[0];
   const actor = await getOrCreateUser(db, actorEmail);
   if (c.authorId !== actor.id) throw new ApiError(403, 'Só o autor pode excluir o comentário');
   // Threading: excluir um comentário-raiz leva junto suas respostas (e as reactions
   // de todas). Como só há 1 nível, basta pegar os filhos diretos deste id.
   const replies = await db
      .select({ id: commentT.id })
      .from(commentT)
      .where(eq(commentT.parentId, commentId));
   const ids = [commentId, ...replies.map((r) => r.id)];
   await db.delete(commentReaction).where(inArray(commentReaction.commentId, ids));
   await db.delete(commentT).where(inArray(commentT.id, ids));
   publish({ entity: 'comment', action: 'deleted', id: commentId, actorEmail });
   return true;
}

/** Feed unificado: eventos + comentários, ordenado por data. */
export async function listActivity(
   db: Db,
   issueId: string,
   meEmail?: string
): Promise<ActivityItem[]> {
   const [events, comments] = await Promise.all([
      db.select().from(activityEvent).where(eq(activityEvent.issueId, issueId)),
      listComments(db, issueId, meEmail),
   ]);
   const users = await loadUsers(db, events.map((e) => e.actorId).filter(Boolean) as string[]);

   const eventItems: ActivityItem[] = events.map((e) => ({
      kind: 'event',
      id: e.id,
      actor: userRef(e.actorId ? users.get(e.actorId) : undefined),
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
      event: e.event,
      text: e.text ?? undefined,
   }));
   const commentItems: ActivityItem[] = comments.map((c) => ({
      kind: 'comment',
      id: c.id,
      actor: c.author,
      createdAt: c.createdAt,
      body: c.body,
      parentId: c.parentId,
      reactions: c.reactions,
   }));
   return [...eventItems, ...commentItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export interface MyActivityItemDto {
   id: string;
   issueId: string;
   issueIdentifier: string;
   issueTitle: string;
   actor: UserRef | null;
   event: string; // tipo do evento (status|priority|...|created) ou 'comment'
   text: string | null;
   createdAt: string;
}

/**
 * "My issues > Activity" (padrão Linear = issues em que EU estive ativo): eventos
 * onde o usuário é o ATOR + comentários que ele escreveu, mais recentes primeiro.
 * A aba renderiza essas issues como board; este método também serve de feed cru.
 */
export async function listMyActivity(
   db: Db,
   userId: string,
   limit = 50
): Promise<MyActivityItemDto[]> {
   const [events, comments] = await Promise.all([
      db.select().from(activityEvent).where(eq(activityEvent.actorId, userId)),
      db
         .select({
            id: commentT.id,
            issueId: commentT.issueId,
            authorId: commentT.authorId,
            createdAt: commentT.createdAt,
         })
         .from(commentT)
         .where(eq(commentT.authorId, userId)),
   ]);
   const issueIds = [
      ...new Set([...events.map((e) => e.issueId), ...comments.map((c) => c.issueId)]),
   ];
   if (issueIds.length === 0) return [];
   const issues = await db
      .select({ id: issueT.id, identifier: issueT.identifier, title: issueT.title })
      .from(issueT)
      .where(inArray(issueT.id, issueIds));
   const issueMap = new Map(issues.map((i) => [i.id, i]));
   const actorIds = [
      ...new Set(
         [...events.map((e) => e.actorId), ...comments.map((c) => c.authorId)].filter(
            Boolean
         ) as string[]
      ),
   ];
   const users = await loadUsers(db, actorIds);
   const toIso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));

   const items: MyActivityItemDto[] = [];
   for (const e of events) {
      const iss = issueMap.get(e.issueId);
      if (!iss) continue;
      items.push({
         id: e.id,
         issueId: e.issueId,
         issueIdentifier: iss.identifier,
         issueTitle: iss.title,
         actor: userRef(e.actorId ? users.get(e.actorId) : undefined),
         event: e.event,
         text: e.text ?? null,
         createdAt: toIso(e.createdAt),
      });
   }
   for (const c of comments) {
      const iss = issueMap.get(c.issueId);
      if (!iss) continue;
      items.push({
         id: c.id,
         issueId: c.issueId,
         issueIdentifier: iss.identifier,
         issueTitle: iss.title,
         actor: userRef(users.get(c.authorId)),
         event: 'comment',
         text: 'commented',
         createdAt: toIso(c.createdAt),
      });
   }
   items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
   return items.slice(0, limit);
}

export async function addReaction(
   db: Db,
   commentId: string,
   emoji: string,
   actorEmail: string
): Promise<void> {
   const user = await getOrCreateUser(db, actorEmail);
   await db
      .insert(commentReaction)
      .values({ commentId, emoji, userId: user.id })
      .onConflictDoNothing();
   publish({ entity: 'comment', action: 'updated', id: commentId, actorEmail });
}

export async function removeReaction(
   db: Db,
   commentId: string,
   emoji: string,
   actorEmail: string
): Promise<void> {
   const user = await getOrCreateUser(db, actorEmail);
   await db
      .delete(commentReaction)
      .where(
         and(
            eq(commentReaction.commentId, commentId),
            eq(commentReaction.emoji, emoji),
            eq(commentReaction.userId, user.id)
         )
      );
   publish({ entity: 'comment', action: 'updated', id: commentId, actorEmail });
}
