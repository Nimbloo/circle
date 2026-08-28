import { randomUUID } from 'node:crypto';
import { desc, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { auditLog, appUser } from '@/db/schema';
import type { UserRef } from './issues';

export interface AuditEntry {
   actorId?: string | null;
   action: string; // ex.: 'role.change', 'team.create', 'team.delete', 'member.add', 'member.remove'
   targetType?: string | null;
   targetId?: string | null;
   meta?: Record<string, unknown>;
}

export interface AuditLogDto {
   id: string;
   actor: UserRef | null;
   action: string;
   targetType: string | null;
   targetId: string | null;
   meta: Record<string, unknown> | null;
   createdAt: string;
}

/**
 * Registra uma entrada no audit log (append-only). Best-effort: nunca lança — uma
 * falha de auditoria não pode derrubar a ação administrativa em si.
 */
export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
   try {
      await db.insert(auditLog).values({
         id: randomUUID(),
         actorId: entry.actorId ?? null,
         action: entry.action,
         targetType: entry.targetType ?? null,
         targetId: entry.targetId ?? null,
         meta: entry.meta ? JSON.stringify(entry.meta) : null,
         createdAt: new Date(),
      });
   } catch (e) {
      console.warn('[circle] audit falhou:', (e as Error).message);
   }
}

export async function listAudit(db: Db, limit = 200): Promise<AuditLogDto[]> {
   const rows = await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(Math.min(Math.max(limit, 1), 1000));
   const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])];
   const actors = actorIds.length
      ? await db.select().from(appUser).where(inArray(appUser.id, actorIds))
      : [];
   const byId = new Map(actors.map((u) => [u.id, u]));
   return rows.map((r) => {
      const a = r.actorId ? byId.get(r.actorId) : undefined;
      return {
         id: r.id,
         actor: a
            ? { id: a.id, slug: a.slug, name: a.name, email: a.email, avatarUrl: a.avatarUrl }
            : null,
         action: r.action,
         targetType: r.targetType,
         targetId: r.targetId,
         meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
         createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
   });
}
