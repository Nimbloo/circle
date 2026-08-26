import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { document, appUser } from '@/db/schema';
import { ApiError } from './errors';

/**
 * "Doc pages": documentos editáveis (título + conteúdo) linkados a issues via
 * issue_resource (kind='document'). Distinto do team_document (folders/metadata) —
 * este tem conteúdo e uma página de edição própria (/[orgId]/document/[id]).
 */
export interface DocPageDto {
   id: string;
   title: string;
   content: string;
   updatedAt: string;
}

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();

/** Cria um documento (título opcional; default "Untitled document"). */
export async function createDocPage(
   db: Db,
   input: { title?: string },
   actorEmail: string
): Promise<DocPageDto> {
   const creator = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, actorEmail))
      .limit(1);
   const id = randomUUID();
   const title = input.title?.trim() || 'Untitled document';
   const now = new Date();
   await db.insert(document).values({
      id,
      title,
      content: '',
      createdById: creator[0]?.id ?? null,
      createdAt: now,
      updatedAt: now,
   });
   return { id, title, content: '', updatedAt: now.toISOString() };
}

export async function getDocPage(db: Db, id: string): Promise<DocPageDto | null> {
   const rows = await db.select().from(document).where(eq(document.id, id)).limit(1);
   if (rows.length === 0) return null;
   const d = rows[0];
   return { id: d.id, title: d.title, content: d.content, updatedAt: iso(d.updatedAt) };
}

/** Atualiza título e/ou conteúdo do documento. */
export async function updateDocPage(
   db: Db,
   id: string,
   patch: { title?: string; content?: string }
): Promise<DocPageDto> {
   const set: Partial<typeof document.$inferInsert> = { updatedAt: new Date() };
   if (patch.title !== undefined) set.title = patch.title.trim() || 'Untitled document';
   if (patch.content !== undefined) set.content = patch.content;
   const res = await db.update(document).set(set).where(eq(document.id, id)).returning();
   if (res.length === 0) throw new ApiError(404, `Documento '${id}' não encontrado`);
   const d = res[0];
   return { id: d.id, title: d.title, content: d.content, updatedAt: iso(d.updatedAt) };
}
