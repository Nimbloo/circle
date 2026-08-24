import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { issueSubscriber } from '@/db/schema';
import { createNotification } from './notifications';

/** Inscreve usuários numa issue (idempotente). Ignora ids nulos/vazios/duplicados. */
export async function subscribeUsers(
   db: Db,
   issueId: string,
   userIds: (string | null | undefined)[]
): Promise<void> {
   const ids = [...new Set(userIds.filter((x): x is string => !!x))];
   if (ids.length === 0) return;
   await db
      .insert(issueSubscriber)
      .values(ids.map((userId) => ({ issueId, userId })))
      .onConflictDoNothing();
}

/** Remove um usuário dos followers da issue. */
export async function unsubscribeUser(db: Db, issueId: string, userId: string): Promise<void> {
   await db
      .delete(issueSubscriber)
      .where(and(eq(issueSubscriber.issueId, issueId), eq(issueSubscriber.userId, userId)));
}

/** Ids dos followers da issue. */
export async function listSubscriberIds(db: Db, issueId: string): Promise<string[]> {
   const rows = await db
      .select({ userId: issueSubscriber.userId })
      .from(issueSubscriber)
      .where(eq(issueSubscriber.issueId, issueId));
   return rows.map((r) => r.userId);
}

/**
 * Notifica (IN-APP) todos os followers da issue sobre uma atividade, menos o ator e
 * quaisquer `excludeIds` (ex.: @mencionados, que já recebem o canal externo via
 * dispatchNotification). É o que faz a notificação chegar a quem SEGUE a issue sem ser
 * o responsável. Best-effort (nunca lança — a notificação é secundária ao request).
 */
export async function notifySubscribers(
   db: Db,
   input: {
      issueId: string;
      actorId?: string | null;
      type: string;
      content: string;
      excludeIds?: string[];
   }
): Promise<void> {
   try {
      const exclude = new Set(
         [input.actorId, ...(input.excludeIds ?? [])].filter(Boolean) as string[]
      );
      const recipients = (await listSubscriberIds(db, input.issueId)).filter(
         (id) => !exclude.has(id)
      );
      if (recipients.length === 0) return;
      await Promise.all(
         recipients.map((recipientId) =>
            createNotification(db, {
               recipientId,
               type: input.type,
               issueId: input.issueId,
               actorId: input.actorId ?? null,
               content: input.content,
            })
         )
      );
   } catch (err) {
      console.error('[circle] notifySubscribers falhou:', err);
   }
}
