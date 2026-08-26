import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { issueFavorite } from '@/db/schema';

/** true se o usuário já favoritou a issue. */
export async function isFavorite(db: Db, issueId: string, userId: string): Promise<boolean> {
   const rows = await db
      .select({ issueId: issueFavorite.issueId })
      .from(issueFavorite)
      .where(and(eq(issueFavorite.issueId, issueId), eq(issueFavorite.userId, userId)))
      .limit(1);
   return rows.length > 0;
}

/** Ids das issues favoritadas pelo usuário. */
export async function listFavoriteIds(db: Db, userId: string): Promise<string[]> {
   const rows = await db
      .select({ issueId: issueFavorite.issueId })
      .from(issueFavorite)
      .where(eq(issueFavorite.userId, userId));
   return rows.map((r) => r.issueId);
}

/** Alterna o favorito (adiciona se não existe, remove se existe). Retorna o novo estado. */
export async function toggleFavorite(db: Db, issueId: string, userId: string): Promise<boolean> {
   if (await isFavorite(db, issueId, userId)) {
      await db
         .delete(issueFavorite)
         .where(and(eq(issueFavorite.issueId, issueId), eq(issueFavorite.userId, userId)));
      return false;
   }
   await db.insert(issueFavorite).values({ issueId, userId }).onConflictDoNothing();
   return true;
}
