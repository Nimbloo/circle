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
   appUser,
} from '@/db/schema';
import { getOrCreateUser } from './users';
import { dispatchNotification } from './notify';
import { ApiError } from './errors';
import type { UserRef } from './issues';

function userRef(
   u:
      | { id: string; slug: string; name: string; email: string; avatarUrl: string | null }
      | undefined
): UserRef | null {
   return u
      ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
      : null;
}

export interface CommentDto {
   id: string;
   author: UserRef | null;
   body: string;
   createdAt: string;
   reactions: { emoji: string; count: number }[];
}

export interface ActivityItem {
   kind: 'event' | 'comment';
   id: string;
   actor: UserRef | null;
   createdAt: string;
   event?: string;
   text?: string;
   body?: string;
   reactions?: { emoji: string; count: number }[];
}

export interface IssueDetailDto {
   identifier: string;
   description: string | null;
   milestone: string | null;
   subIssueIds: string[];
   relatedIds: string[];
   blockedByIds: string[];
   prLinks: { id: string; title: string; status: string }[];
}

async function loadUsers(db: Db, ids: string[]) {
   const uniq = [...new Set(ids.filter(Boolean))];
   if (uniq.length === 0) return new Map<string, typeof appUser.$inferSelect>();
   const rows = await db.select().from(appUser).where(inArray(appUser.id, uniq));
   return new Map(rows.map((u) => [u.id, u]));
}

async function reactionsByComment(db: Db, commentIds: string[]) {
   const map = new Map<string, { emoji: string; count: number }[]>();
   if (commentIds.length === 0) return map;
   const rows = await db
      .select()
      .from(commentReaction)
      .where(inArray(commentReaction.commentId, commentIds));
   const agg = new Map<string, Map<string, number>>();
   for (const r of rows) {
      const byEmoji = agg.get(r.commentId) ?? new Map<string, number>();
      byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? 0) + 1);
      agg.set(r.commentId, byEmoji);
   }
   for (const [cid, byEmoji] of agg)
      map.set(
         cid,
         [...byEmoji.entries()].map(([emoji, count]) => ({ emoji, count }))
      );
   return map;
}

export async function getIssueDetail(db: Db, issueId: string): Promise<IssueDetailDto | null> {
   const rows = await db.select().from(issueT).where(eq(issueT.id, issueId)).limit(1);
   if (rows.length === 0) return null;
   const iss = rows[0];
   const [content, relations, prs] = await Promise.all([
      db.select().from(issueContent).where(eq(issueContent.issueId, issueId)).limit(1),
      db.select().from(issueRelation).where(eq(issueRelation.issueId, issueId)),
      db.select().from(issuePrLink).where(eq(issuePrLink.issueId, issueId)),
   ]);
   return {
      identifier: iss.identifier,
      description: content[0]?.description ?? null,
      milestone: content[0]?.milestone ?? null,
      subIssueIds: relations.filter((r) => r.kind === 'sub').map((r) => r.relatedId),
      relatedIds: relations.filter((r) => r.kind === 'related').map((r) => r.relatedId),
      blockedByIds: relations.filter((r) => r.kind === 'blocked_by').map((r) => r.relatedId),
      prLinks: prs.map((p) => ({ id: p.id, title: p.title, status: p.status })),
   };
}

export type RelationKind = 'sub' | 'related' | 'blocked_by';
export const RELATION_KINDS: readonly RelationKind[] = ['sub', 'related', 'blocked_by'];

/** Cria uma relação issueId -> relatedId (idempotente). Retorna o detail atualizado. */
export async function addRelation(
   db: Db,
   issueId: string,
   relatedId: string,
   kind: RelationKind
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
   }
   return getIssueDetail(db, issueId);
}

/** Remove a relação issueId -> relatedId do tipo `kind`. Retorna o detail atualizado. */
export async function removeRelation(
   db: Db,
   issueId: string,
   relatedId: string,
   kind: RelationKind
): Promise<IssueDetailDto | null> {
   await db
      .delete(issueRelation)
      .where(
         and(
            eq(issueRelation.issueId, issueId),
            eq(issueRelation.relatedId, relatedId),
            eq(issueRelation.kind, kind)
         )
      );
   return getIssueDetail(db, issueId);
}

export async function listComments(db: Db, issueId: string): Promise<CommentDto[]> {
   const comments = await db
      .select()
      .from(commentT)
      .where(eq(commentT.issueId, issueId))
      .orderBy(asc(commentT.createdAt));
   const [users, reactions] = await Promise.all([
      loadUsers(
         db,
         comments.map((c) => c.authorId)
      ),
      reactionsByComment(
         db,
         comments.map((c) => c.id)
      ),
   ]);
   return comments.map((c) => ({
      id: c.id,
      author: userRef(users.get(c.authorId)),
      body: c.body,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      reactions: reactions.get(c.id) ?? [],
   }));
}

export async function addComment(
   db: Db,
   issueId: string,
   body: string,
   actorEmail: string
): Promise<CommentDto> {
   const author = await getOrCreateUser(db, actorEmail);
   const id = randomUUID();
   const now = new Date();
   await db.insert(commentT).values({ id, issueId, authorId: author.id, body, createdAt: now });

   // @mentions: resolve os slugs (prefixo do e-mail) citados no corpo e notifica.
   const slugs = [
      ...new Set((body.match(/@([a-z0-9._-]+)/gi) ?? []).map((m) => m.slice(1).toLowerCase())),
   ];
   const mentioned = slugs.length
      ? await db.select().from(appUser).where(inArray(appUser.slug, slugs))
      : [];
   const mentionedIds = new Set<string>();
   for (const u of mentioned) {
      if (u.id === author.id) continue;
      mentionedIds.add(u.id);
      await dispatchNotification(db, {
         type: 'mention',
         issueId,
         recipientId: u.id,
         actorId: author.id,
         content: `${author.name} mencionou você em um comentário`,
      });
   }

   // Notifica o responsável (se não for o próprio autor nem já mencionado acima)
   const [iss] = await db
      .select({ assigneeId: issueT.assigneeId })
      .from(issueT)
      .where(eq(issueT.id, issueId))
      .limit(1);
   if (iss?.assigneeId && iss.assigneeId !== author.id && !mentionedIds.has(iss.assigneeId)) {
      await dispatchNotification(db, {
         type: 'comment',
         issueId,
         recipientId: iss.assigneeId,
         actorId: author.id,
         content: `${author.name} comentou nesta issue`,
      });
   }

   return { id, author: userRef(author), body, createdAt: now.toISOString(), reactions: [] };
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
   const [users, reactions] = await Promise.all([
      loadUsers(db, [c.authorId]),
      reactionsByComment(db, [commentId]),
   ]);
   return {
      id: c.id,
      author: userRef(users.get(c.authorId)),
      body,
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
   await db.delete(commentReaction).where(eq(commentReaction.commentId, commentId));
   await db.delete(commentT).where(eq(commentT.id, commentId));
   return true;
}

/** Feed unificado: eventos + comentários, ordenado por data. */
export async function listActivity(db: Db, issueId: string): Promise<ActivityItem[]> {
   const [events, comments] = await Promise.all([
      db.select().from(activityEvent).where(eq(activityEvent.issueId, issueId)),
      listComments(db, issueId),
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
      reactions: c.reactions,
   }));
   return [...eventItems, ...commentItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
}
