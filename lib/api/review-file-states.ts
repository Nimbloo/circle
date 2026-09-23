import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { review, reviewFileState } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
import { getOrCreateUser } from './users';

/**
 * "Reviewed" persistido por (review, usuário, arquivo) — antes só localStorage
 * (`components/common/reviews/diff-view.tsx`), que some ao trocar de navegador ou
 * limpar o storage. A linha só existe enquanto o arquivo está marcado como revisado;
 * desmarcar apaga a linha.
 */

async function assertReviewExists(db: Db, reviewId: string): Promise<void> {
   const rows = await db
      .select({ id: review.id })
      .from(review)
      .where(eq(review.id, reviewId))
      .limit(1);
   if (rows.length === 0) throw new ApiError(404, `Review '${reviewId}' não encontrado`);
}

/** Caminhos que o usuário já marcou como revisados neste review. */
export async function listReviewedPaths(
   db: Db,
   reviewId: string,
   actorEmail: string
): Promise<string[]> {
   await assertReviewExists(db, reviewId);
   const me = await getOrCreateUser(db, actorEmail);
   const rows = await db
      .select({ path: reviewFileState.path })
      .from(reviewFileState)
      .where(and(eq(reviewFileState.reviewId, reviewId), eq(reviewFileState.userId, me.id)));
   return rows.map((r) => r.path);
}

/**
 * Marca/desmarca um arquivo como revisado (escopo do usuário). Publica `review` com
 * `recipientId` — só as OUTRAS abas do mesmo usuário reagem (#XX).
 */
export async function setReviewFileState(
   db: Db,
   reviewId: string,
   actorEmail: string,
   path: string,
   reviewed: boolean
): Promise<{ path: string; reviewed: boolean }> {
   await assertReviewExists(db, reviewId);
   const cleanPath = path.trim();
   if (!cleanPath) throw new ApiError(400, 'path é obrigatório');
   const me = await getOrCreateUser(db, actorEmail);

   if (reviewed) {
      await db
         .insert(reviewFileState)
         .values({ reviewId, userId: me.id, path: cleanPath, reviewedAt: new Date() })
         .onConflictDoUpdate({
            target: [reviewFileState.reviewId, reviewFileState.userId, reviewFileState.path],
            set: { reviewedAt: new Date() },
         });
   } else {
      await db
         .delete(reviewFileState)
         .where(
            and(
               eq(reviewFileState.reviewId, reviewId),
               eq(reviewFileState.userId, me.id),
               eq(reviewFileState.path, cleanPath)
            )
         );
   }

   publish({ entity: 'review', action: 'updated', id: reviewId, recipientId: me.id });
   return { path: cleanPath, reviewed };
}
