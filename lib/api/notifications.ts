import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { notification, issue as issueT, appUser } from '@/db/schema';
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
}

export async function listInbox(
   db: Db,
   recipientId: string,
   opts: ListInboxOptions = {}
): Promise<NotificationDto[]> {
   const conds = [eq(notification.recipientId, recipientId)];
   if (opts.read !== undefined) conds.push(eq(notification.read, opts.read));
   if (opts.actorId) conds.push(eq(notification.actorId, opts.actorId));
   let rows = await db
      .select()
      .from(notification)
      .where(and(...conds))
      .orderBy(desc(notification.createdAt));
   if (opts.type?.length) rows = rows.filter((r) => opts.type!.includes(r.type));
   return assemble(db, rows);
}

export async function unreadCount(db: Db, recipientId: string): Promise<number> {
   const rows = await db
      .select({ id: notification.id })
      .from(notification)
      .where(and(eq(notification.recipientId, recipientId), eq(notification.read, false)));
   return rows.length;
}

export async function setRead(db: Db, id: string, read: boolean): Promise<boolean> {
   const res = await db
      .update(notification)
      .set({ read })
      .where(eq(notification.id, id))
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
      createdAt: new Date(),
   });
   return id;
}
