import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, review, reviewComment } from '@/db/schema';
import { isAdmin } from './auth';
import { ApiError } from './errors';
import { publish } from './events';
import { getOrCreateUser } from './users';

/** `comment` é conversa; `approve`/`request_changes` carregam o veredito do review. */
export type ReviewCommentKind = 'comment' | 'approve' | 'request_changes';
export const REVIEW_COMMENT_KINDS: readonly ReviewCommentKind[] = [
   'comment',
   'approve',
   'request_changes',
];

export interface ReviewCommentAuthor {
   id: string;
   name: string;
   avatarUrl: string | null;
}

export interface ReviewCommentDto {
   id: string;
   reviewId: string;
   author: ReviewCommentAuthor | null;
   /** Arquivo do diff (caminho completo) — null = comentário geral do review. */
   path: string | null;
   /** Linha do arquivo NOVO à qual o comentário está ancorado — null = arquivo inteiro. */
   line: number | null;
   kind: ReviewCommentKind;
   body: string;
   createdAt: string;
   updatedAt: string;
}

/** Último veredito registrado (comentário com `kind` diferente de `comment`). */
export interface ReviewVerdictDto {
   kind: Exclude<ReviewCommentKind, 'comment'>;
   author: ReviewCommentAuthor | null;
   createdAt: string;
}

export interface AddReviewCommentInput {
   body: string;
   path?: string | null;
   line?: number | null;
   kind?: ReviewCommentKind;
}

type Row = typeof reviewComment.$inferSelect;

function toIso(d: Date | string): string {
   return d instanceof Date ? d.toISOString() : String(d);
}

function toKind(raw: string): ReviewCommentKind {
   return (REVIEW_COMMENT_KINDS as readonly string[]).includes(raw)
      ? (raw as ReviewCommentKind)
      : 'comment';
}

async function loadAuthors(db: Db, ids: string[]): Promise<Map<string, ReviewCommentAuthor>> {
   const uniq = [...new Set(ids)];
   if (uniq.length === 0) return new Map();
   const rows = await db
      .select({ id: appUser.id, name: appUser.name, avatarUrl: appUser.avatarUrl })
      .from(appUser)
      .where(inArray(appUser.id, uniq));
   return new Map(rows.map((u) => [u.id, u]));
}

function toDto(row: Row, authors: Map<string, ReviewCommentAuthor>): ReviewCommentDto {
   return {
      id: row.id,
      reviewId: row.reviewId,
      author: authors.get(row.authorId) ?? null,
      path: row.path ?? null,
      line: row.line ?? null,
      kind: toKind(row.kind),
      body: row.body,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
   };
}

/** Veredito corrente = último comentário (cronológico) cujo `kind` não é `comment`. */
export function latestVerdict(comments: ReviewCommentDto[]): ReviewVerdictDto | null {
   for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (c.kind !== 'comment') return { kind: c.kind, author: c.author, createdAt: c.createdAt };
   }
   return null;
}

/** Thread do review em ordem cronológica (inclui os ancorados em arquivo/linha). */
export async function listReviewComments(db: Db, reviewId: string): Promise<ReviewCommentDto[]> {
   const rows = await db
      .select()
      .from(reviewComment)
      .where(eq(reviewComment.reviewId, reviewId))
      .orderBy(asc(reviewComment.createdAt), asc(reviewComment.id));
   const authors = await loadAuthors(
      db,
      rows.map((r) => r.authorId)
   );
   return rows.map((r) => toDto(r, authors));
}

/**
 * Cria um comentário (geral, por arquivo ou por linha) ou registra um veredito
 * (`approve`/`request_changes`, que pode vir sem texto). 404 se o review não existir;
 * 400 se houver `line` sem `path`. Publica `review_comment/created` com o id do REVIEW
 * (o cliente recarrega o review aberto).
 */
export async function addReviewComment(
   db: Db,
   reviewId: string,
   input: AddReviewCommentInput,
   actorEmail: string
): Promise<ReviewCommentDto> {
   const exists = await db
      .select({ id: review.id })
      .from(review)
      .where(eq(review.id, reviewId))
      .limit(1);
   if (exists.length === 0) throw new ApiError(404, `Review '${reviewId}' não encontrado`);

   const kind = input.kind ?? 'comment';
   const body = input.body.trim();
   const path = input.path?.trim() || null;
   const line = input.line ?? null;
   if (line != null && !path) throw new ApiError(400, 'Linha exige o caminho do arquivo');
   if (line != null && (!Number.isInteger(line) || line < 1))
      throw new ApiError(400, 'Linha inválida');
   if (kind === 'comment' && !body) throw new ApiError(400, 'Comentário vazio');

   const author = await getOrCreateUser(db, actorEmail);
   const id = randomUUID();
   const now = new Date();
   await db.insert(reviewComment).values({
      id,
      reviewId,
      authorId: author.id,
      path,
      line,
      kind,
      body,
      createdAt: now,
      updatedAt: now,
   });
   publish({ entity: 'review_comment', action: 'created', id: reviewId, actorEmail });
   return {
      id,
      reviewId,
      author: { id: author.id, name: author.name, avatarUrl: author.avatarUrl },
      path,
      line,
      kind,
      body,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
   };
}

async function findInReview(db: Db, reviewId: string, commentId: string): Promise<Row | null> {
   const rows = await db
      .select()
      .from(reviewComment)
      .where(and(eq(reviewComment.id, commentId), eq(reviewComment.reviewId, reviewId)))
      .limit(1);
   return rows[0] ?? null;
}

/**
 * Edita o texto de um comentário. Só o AUTOR edita (403). Retorna null se o
 * comentário não existir neste review.
 */
export async function updateReviewComment(
   db: Db,
   reviewId: string,
   commentId: string,
   body: string,
   actorEmail: string
): Promise<ReviewCommentDto | null> {
   const row = await findInReview(db, reviewId, commentId);
   if (!row) return null;
   const actor = await getOrCreateUser(db, actorEmail);
   if (row.authorId !== actor.id) throw new ApiError(403, 'Só o autor pode editar o comentário');
   const text = body.trim();
   if (row.kind === 'comment' && !text) throw new ApiError(400, 'Comentário vazio');
   const now = new Date();
   await db
      .update(reviewComment)
      .set({ body: text, updatedAt: now })
      .where(eq(reviewComment.id, commentId));
   publish({ entity: 'review_comment', action: 'updated', id: reviewId, actorEmail });
   const authors = await loadAuthors(db, [row.authorId]);
   return toDto({ ...row, body: text, updatedAt: now }, authors);
}

/**
 * Exclui um comentário. Autor OU admin (403 caso contrário). Retorna false se o
 * comentário não existir neste review.
 */
export async function deleteReviewComment(
   db: Db,
   reviewId: string,
   commentId: string,
   actorEmail: string
): Promise<boolean> {
   const row = await findInReview(db, reviewId, commentId);
   if (!row) return false;
   const actor = await getOrCreateUser(db, actorEmail);
   if (row.authorId !== actor.id && !(await isAdmin(actorEmail, db)))
      throw new ApiError(403, 'Só o autor ou um admin pode excluir o comentário');
   await db.delete(reviewComment).where(eq(reviewComment.id, commentId));
   publish({ entity: 'review_comment', action: 'deleted', id: reviewId, actorEmail });
   return true;
}
