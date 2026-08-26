import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { notification, issue as issueT, appUser } from '@/db/schema';
import { publish } from './events';
import type { UserRef } from './issues';

type NotifRow = typeof notification.$inferSelect;

export interface NotificationDto {
   id: string;
   type: string;
   content: string | null;
   read: boolean;
   createdAt: string;
   actor: UserRef | null;
   issue: { id: string; identifier: string; title: string } | null;
}

async function assemble(db: Db, rows: NotifRow[]): Promise<NotificationDto[]> {
   if (rows.length === 0) return [];
   const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])];
   const issueIds = [...new Set(rows.map((r) => r.issueId).filter(Boolean) as string[])];
   const [actors, issues] = await Promise.all([
      actorIds.length
         ? db.select().from(appUser).where(inArray(appUser.id, actorIds))
         : Promise.resolve([]),
      issueIds.length
         ? db
              .select({ id: issueT.id, identifier: issueT.identifier, title: issueT.title })
              .from(issueT)
              .where(inArray(issueT.id, issueIds))
         : Promise.resolve([]),
   ]);
   const actorMap = new Map(actors.map((u) => [u.id, u]));
   const issueMap = new Map(issues.map((i) => [i.id, i]));
   return rows.map((r) => {
      const a = r.actorId ? actorMap.get(r.actorId) : undefined;
      const i = r.issueId ? issueMap.get(r.issueId) : undefined;
      return {
         id: r.id,
         type: r.type,
         content: r.content,
         read: r.read,
         createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
         actor: a
            ? { id: a.id, slug: a.slug, name: a.name, email: a.email, avatarUrl: a.avatarUrl }
            : null,
         issue: i ? { id: i.id, identifier: i.identifier, title: i.title } : null,
      };
   });
}

export interface ListInboxOptions {
   read?: boolean;
   type?: string[];
   actorId?: string;
   /** Filtro "From": múltiplos atores (user ids). */
   actorIds?: string[];
   limit?: number;
}

/** Teto default do inbox: as N notificações mais recentes. A tabela cresce sem teto
 * (toda atribuição/menção/comentário gera linha) e o store re-baixa a cada evento SSE;
 * sem LIMIT a latência/transferência cresciam linearmente com o histórico do usuário. */
const DEFAULT_INBOX_LIMIT = 100;

export async function listInbox(
   db: Db,
   recipientId: string,
   opts: ListInboxOptions = {}
): Promise<NotificationDto[]> {
   const conds = [eq(notification.recipientId, recipientId)];
   if (opts.read !== undefined) conds.push(eq(notification.read, opts.read));
   if (opts.actorId) conds.push(eq(notification.actorId, opts.actorId));
   if (opts.actorIds?.length) conds.push(inArray(notification.actorId, opts.actorIds));
   if (opts.type?.length) conds.push(inArray(notification.type, opts.type));
   // Notificação adiada (snooze) fica OCULTA até `snoozedUntil`; reaparece quando o
   // instante passa. `or(isNull, lte(now))` cobre "nunca adiada" + "prazo vencido".
   const snoozeCond = or(
      isNull(notification.snoozedUntil),
      lte(notification.snoozedUntil, new Date())
   );
   if (snoozeCond) conds.push(snoozeCond);
   const rows = await db
      .select()
      .from(notification)
      .where(and(...conds))
      .orderBy(desc(notification.createdAt))
      .limit(Math.min(Math.max(opts.limit ?? DEFAULT_INBOX_LIMIT, 1), 500));
   return assemble(db, rows);
}

export async function unreadCount(db: Db, recipientId: string): Promise<number> {
   const rows = await db
      .select({ n: count() })
      .from(notification)
      .where(
         and(
            eq(notification.recipientId, recipientId),
            eq(notification.read, false),
            // Notificação adiada não conta como não-lida enquanto o snooze vigora.
            or(isNull(notification.snoozedUntil), lte(notification.snoozedUntil, new Date()))
         )
      );
   return rows[0]?.n ?? 0;
}

/** Remove uma notificação, escopada ao destinatário (anti-IDOR). */
export async function deleteNotification(
   db: Db,
   id: string,
   recipientId: string
): Promise<boolean> {
   const res = await db
      .delete(notification)
      .where(and(eq(notification.id, id), eq(notification.recipientId, recipientId)))
      .returning({ id: notification.id });
   if (res.length > 0) publish({ entity: 'notification', action: 'deleted', id });
   return res.length > 0;
}

/** Adia (ou desfaz, com `until=null`) uma notificação até o instante dado. Escopado
 * ao destinatário. Adiar não altera o estado lido/não-lido — só a visibilidade. */
export async function snoozeNotification(
   db: Db,
   id: string,
   until: Date | null,
   recipientId: string
): Promise<boolean> {
   const res = await db
      .update(notification)
      .set({ snoozedUntil: until })
      .where(and(eq(notification.id, id), eq(notification.recipientId, recipientId)))
      .returning({ id: notification.id });
   if (res.length > 0) publish({ entity: 'notification', action: 'updated', id });
   return res.length > 0;
}

/** Marca uma notificação como lida/não-lida, escopada ao destinatário (anti-IDOR). */
export async function setRead(
   db: Db,
   id: string,
   read: boolean,
   recipientId: string
): Promise<boolean> {
   const res = await db
      .update(notification)
      .set({ read })
      .where(and(eq(notification.id, id), eq(notification.recipientId, recipientId)))
      .returning({ id: notification.id });
   return res.length > 0;
}

export async function markAllRead(db: Db, recipientId: string): Promise<number> {
   const res = await db
      .update(notification)
      .set({ read: true })
      .where(and(eq(notification.recipientId, recipientId), eq(notification.read, false)))
      .returning({ id: notification.id });
   return res.length;
}

export interface CreateNotificationInput {
   recipientId: string;
   type: string;
   issueId?: string | null;
   actorId?: string | null;
   content?: string | null;
   /** Oculta a notificação até esse instante (usado por lembretes/reminders). */
   snoozedUntil?: Date | null;
}

export async function createNotification(db: Db, input: CreateNotificationInput): Promise<string> {
   const id = randomUUID();
   await db.insert(notification).values({
      id,
      recipientId: input.recipientId,
      type: input.type,
      issueId: input.issueId ?? null,
      actorId: input.actorId ?? null,
      content: input.content ?? null,
      read: false,
      snoozedUntil: input.snoozedUntil ?? null,
      createdAt: new Date(),
   });
   publish({ entity: 'notification', action: 'created', id });
   return id;
}
