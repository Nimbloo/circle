import { randomUUID } from 'node:crypto';
import { eq, inArray, asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { documentFolder, teamDocument, appUser } from '@/db/schema';
import { getOrCreateUser } from './users';
import { isAdmin } from './auth';
import type { UserRef } from './issues';
import { ApiError } from './errors';

export interface DocumentDto {
   id: string;
   folderId: string;
   name: string;
   icon: string | null;
   creator: UserRef | null;
   pinned: boolean;
   createdAt: string;
   updatedAt: string;
}

export interface FolderDto {
   id: string;
   teamId: string;
   name: string;
   icon: string | null;
   documents: DocumentDto[];
}

/** Folders do time com seus documentos. */
export async function listTeamDocuments(db: Db, teamId: string): Promise<FolderDto[]> {
   const folders = await db
      .select()
      .from(documentFolder)
      .where(eq(documentFolder.teamId, teamId))
      .orderBy(asc(documentFolder.name));
   if (folders.length === 0) return [];
   const folderIds = folders.map((f) => f.id);
   const docs = await db
      .select()
      .from(teamDocument)
      .where(inArray(teamDocument.folderId, folderIds));
   const creatorIds = [...new Set(docs.map((d) => d.creatorId))];
   const creators = creatorIds.length
      ? await db.select().from(appUser).where(inArray(appUser.id, creatorIds))
      : [];
   const creatorMap = new Map(creators.map((u) => [u.id, u]));

   const docsByFolder = new Map<string, DocumentDto[]>();
   for (const d of docs) {
      const c = creatorMap.get(d.creatorId);
      const dto: DocumentDto = {
         id: d.id,
         folderId: d.folderId,
         name: d.name,
         icon: d.icon,
         creator: c
            ? { id: c.id, slug: c.slug, name: c.name, email: c.email, avatarUrl: c.avatarUrl }
            : null,
         pinned: d.pinned,
         createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
         updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
      };
      const arr = docsByFolder.get(d.folderId) ?? [];
      arr.push(dto);
      docsByFolder.set(d.folderId, arr);
   }
   return folders.map((f) => ({
      id: f.id,
      teamId: f.teamId,
      name: f.name,
      icon: f.icon,
      documents: docsByFolder.get(f.id) ?? [],
   }));
}

export async function createFolder(
   db: Db,
   input: { id?: string; teamId: string; name: string; icon?: string | null }
): Promise<FolderDto> {
   if (!input.name?.trim()) throw new ApiError(400, 'name é obrigatório');
   const id = input.id ?? randomUUID();
   await db
      .insert(documentFolder)
      .values({ id, teamId: input.teamId, name: input.name, icon: input.icon ?? null });
   return { id, teamId: input.teamId, name: input.name, icon: input.icon ?? null, documents: [] };
}

export async function createDocument(
   db: Db,
   input: { folderId: string; name: string; icon?: string | null; pinned?: boolean },
   creatorEmail: string
): Promise<DocumentDto> {
   if (!input.name?.trim()) throw new ApiError(400, 'name é obrigatório');
   const creator = await getOrCreateUser(db, creatorEmail);
   const id = randomUUID();
   const now = new Date();
   await db.insert(teamDocument).values({
      id,
      folderId: input.folderId,
      name: input.name,
      icon: input.icon ?? null,
      creatorId: creator.id,
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now,
   });
   return {
      id,
      folderId: input.folderId,
      name: input.name,
      icon: input.icon ?? null,
      creator: {
         id: creator.id,
         slug: creator.slug,
         name: creator.name,
         email: creator.email,
         avatarUrl: creator.avatarUrl,
      },
      pinned: input.pinned ?? false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
   };
}

/** Só o criador do documento (ou um admin) pode alterá-lo/removê-lo (403). */
async function assertDocumentOwner(db: Db, id: string, actorEmail: string): Promise<boolean> {
   const rows = await db
      .select({ creatorId: teamDocument.creatorId })
      .from(teamDocument)
      .where(eq(teamDocument.id, id))
      .limit(1);
   if (rows.length === 0) return false;
   const me = await getOrCreateUser(db, actorEmail);
   if (rows[0].creatorId !== me.id && !(await isAdmin(actorEmail, db)))
      throw new ApiError(403, 'Apenas o criador do documento pode alterá-lo');
   return true;
}

export async function updateDocument(
   db: Db,
   id: string,
   patch: { name?: string; icon?: string | null; pinned?: boolean },
   actorEmail: string
): Promise<boolean> {
   if (!(await assertDocumentOwner(db, id, actorEmail))) return false;
   const set: Record<string, unknown> = { updatedAt: new Date() };
   if (patch.name !== undefined) set.name = patch.name;
   if (patch.icon !== undefined) set.icon = patch.icon;
   if (patch.pinned !== undefined) set.pinned = patch.pinned;
   const res = await db
      .update(teamDocument)
      .set(set)
      .where(eq(teamDocument.id, id))
      .returning({ id: teamDocument.id });
   return res.length > 0;
}

export async function deleteDocument(db: Db, id: string, actorEmail: string): Promise<boolean> {
   if (!(await assertDocumentOwner(db, id, actorEmail))) return false;
   const res = await db
      .delete(teamDocument)
      .where(eq(teamDocument.id, id))
      .returning({ id: teamDocument.id });
   return res.length > 0;
}
