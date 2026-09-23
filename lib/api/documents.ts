import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, asc } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   documentFolder,
   teamDocument,
   teamMember,
   appUser,
   project as projectT,
   projectResource,
} from '@/db/schema';
import { getOrCreateUser, type UserRow } from './users';
import { isAdmin } from './auth';
import { assertCanWriteProject } from './scope';
import type { UserRef } from './issues';
import type { ProjectResourceDto } from './project-detail';
import { ApiError } from './errors';
import { publish } from './events';
import { projectDescriptionDoc } from './description-doc';
import type { EditorDoc } from '@/lib/editor-doc';

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

/** Documento aberto: metadados + corpo (editor de blocos) e a versão do corpo. */
export interface DocumentDetailDto extends DocumentDto {
   teamId: string;
   folderName: string;
   /** JSON do ProseMirror. null = documento sem corpo. */
   descriptionDoc: EditorDoc | null;
   /**
    * Versão opaca do corpo (igual à da issue/projeto). Volta em
    * `expectedDescriptionVersion` no PATCH; divergiu → 409.
    */
   descriptionVersion: string;
}

function descriptionVersionOf(doc: unknown): string {
   return createHash('sha1')
      .update(JSON.stringify(doc ?? null))
      .digest('hex')
      .slice(0, 16);
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

/**
 * Garante que o ator é membro do time (tabela team_member). Retorna a UserRow do ator
 * (reaproveitada pelo chamador). 403 se não for membro.
 */
async function assertTeamMember(db: Db, teamId: string, actorEmail: string): Promise<UserRow> {
   const me = await getOrCreateUser(db, actorEmail);
   const rows = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, me.id)))
      .limit(1);
   if (rows.length === 0) throw new ApiError(403, 'Você não é membro deste time');
   return me;
}

export async function createFolder(
   db: Db,
   input: { id?: string; teamId: string; name: string; icon?: string | null },
   actorEmail: string
): Promise<FolderDto> {
   const name = input.name?.trim();
   if (!name) throw new ApiError(400, 'name é obrigatório');
   await assertTeamMember(db, input.teamId, actorEmail);
   const id = input.id ?? randomUUID();
   await db
      .insert(documentFolder)
      .values({ id, teamId: input.teamId, name, icon: input.icon ?? null });
   publish({ entity: 'document', action: 'created', id, teamId: input.teamId });
   return { id, teamId: input.teamId, name, icon: input.icon ?? null, documents: [] };
}

async function getFolderRow(db: Db, id: string) {
   const rows = await db.select().from(documentFolder).where(eq(documentFolder.id, id)).limit(1);
   return rows[0] ?? null;
}

/** Renomeia/troca o ícone da pasta (membro do time ou admin). null se não existir. */
export async function updateFolder(
   db: Db,
   id: string,
   patch: { name?: string; icon?: string | null },
   actorEmail: string
): Promise<Omit<FolderDto, 'documents'> | null> {
   const folder = await getFolderRow(db, id);
   if (!folder) return null;
   if (!(await isAdmin(actorEmail, db))) await assertTeamMember(db, folder.teamId, actorEmail);
   const set: Partial<typeof documentFolder.$inferInsert> = {};
   if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ApiError(400, 'name é obrigatório');
      set.name = name;
   }
   if (patch.icon !== undefined) set.icon = patch.icon?.trim() || null;
   const [row] =
      Object.keys(set).length > 0
         ? await db.update(documentFolder).set(set).where(eq(documentFolder.id, id)).returning()
         : [folder];
   publish({ entity: 'document', action: 'updated', id, actorEmail, teamId: folder.teamId });
   return { id: row.id, teamId: row.teamId, name: row.name, icon: row.icon };
}

/**
 * Exclui a pasta. Com documentos dentro, eles vão junto — só se o ator puder excluir
 * cada um (criador ou admin); senão 403 e nada muda. Pasta vazia: qualquer membro.
 */
export async function deleteFolder(db: Db, id: string, actorEmail: string): Promise<boolean> {
   const folder = await getFolderRow(db, id);
   if (!folder) return false;
   const admin = await isAdmin(actorEmail, db);
   const me = admin ? null : await assertTeamMember(db, folder.teamId, actorEmail);
   const docs = await db
      .select({ id: teamDocument.id, creatorId: teamDocument.creatorId })
      .from(teamDocument)
      .where(eq(teamDocument.folderId, id));
   if (me && docs.some((d) => d.creatorId !== me.id))
      throw new ApiError(403, 'A pasta tem documentos de outras pessoas');
   const removed = await db.transaction(async (tx) => {
      await tx.delete(teamDocument).where(eq(teamDocument.folderId, id));
      return tx
         .delete(documentFolder)
         .where(eq(documentFolder.id, id))
         .returning({ id: documentFolder.id });
   });
   if (removed.length === 0) return false;
   const teamId = folder.teamId;
   for (const d of docs)
      publish({ entity: 'document', action: 'deleted', id: d.id, actorEmail, teamId });
   publish({ entity: 'document', action: 'deleted', id, actorEmail, teamId });
   return true;
}

export async function createDocument(
   db: Db,
   input: {
      /** Pasta existente. Ou `newFolder`, que cria a pasta junto (Ad#37). */
      folderId?: string;
      /** Pasta nova criada na MESMA transação do documento: falhou, nada fica órfão. */
      newFolder?: { name: string; icon?: string | null };
      teamId: string;
      name: string;
      icon?: string | null;
      pinned?: boolean;
   },
   creatorEmail: string
): Promise<DocumentDto> {
   if (!input.name?.trim()) throw new ApiError(400, 'name é obrigatório');
   if (!input.folderId && !input.newFolder?.name?.trim())
      throw new ApiError(400, 'informe folderId ou newFolder');
   const creator = await assertTeamMember(db, input.teamId, creatorEmail);
   if (input.folderId) {
      // A pasta-alvo tem que existir E pertencer ao mesmo time (evita gravar documento
      // em pasta de outro time via folderId forjado).
      const [folder] = await db
         .select({ teamId: documentFolder.teamId })
         .from(documentFolder)
         .where(eq(documentFolder.id, input.folderId))
         .limit(1);
      if (!folder) throw new ApiError(404, 'Pasta não encontrada');
      if (folder.teamId !== input.teamId)
         throw new ApiError(400, 'A pasta não pertence a este time');
   }
   const folderId = input.folderId ?? randomUUID();
   const id = randomUUID();
   const now = new Date();
   await db.transaction(async (tx) => {
      if (!input.folderId && input.newFolder) {
         await tx.insert(documentFolder).values({
            id: folderId,
            teamId: input.teamId,
            name: input.newFolder.name.trim(),
            icon: input.newFolder.icon ?? null,
         });
      }
      await tx.insert(teamDocument).values({
         id,
         folderId,
         name: input.name.trim(),
         icon: input.icon ?? null,
         creatorId: creator.id,
         pinned: input.pinned ?? false,
         createdAt: now,
         updatedAt: now,
      });
   });
   if (!input.folderId)
      publish({ entity: 'document', action: 'created', id: folderId, teamId: input.teamId });
   publish({
      entity: 'document',
      action: 'created',
      id,
      actorEmail: creatorEmail,
      teamId: input.teamId,
   });
   return {
      id,
      folderId,
      name: input.name.trim(),
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

/**
 * Só o criador do documento (ou um admin) pode alterá-lo/removê-lo (403). Devolve o time
 * do documento (vai no evento, #58) ou null se não existir.
 */
async function assertDocumentOwner(db: Db, id: string, actorEmail: string): Promise<string | null> {
   const rows = await db
      .select({ creatorId: teamDocument.creatorId, teamId: documentFolder.teamId })
      .from(teamDocument)
      .innerJoin(documentFolder, eq(documentFolder.id, teamDocument.folderId))
      .where(eq(teamDocument.id, id))
      .limit(1);
   if (rows.length === 0) return null;
   const me = await getOrCreateUser(db, actorEmail);
   if (rows[0].creatorId !== me.id && !(await isAdmin(actorEmail, db)))
      throw new ApiError(403, 'Apenas o criador do documento pode alterá-lo');
   return rows[0].teamId;
}

/** Documento com corpo e versão. null se não existir. */
export async function getDocument(db: Db, id: string): Promise<DocumentDetailDto | null> {
   const rows = await db
      .select({ doc: teamDocument, folder: documentFolder, creator: appUser })
      .from(teamDocument)
      .innerJoin(documentFolder, eq(documentFolder.id, teamDocument.folderId))
      .leftJoin(appUser, eq(appUser.id, teamDocument.creatorId))
      .where(eq(teamDocument.id, id))
      .limit(1);
   if (rows.length === 0) return null;
   const { doc: d, folder, creator: c } = rows[0];
   return {
      id: d.id,
      folderId: d.folderId,
      folderName: folder.name,
      teamId: folder.teamId,
      name: d.name,
      icon: d.icon,
      creator: c
         ? { id: c.id, slug: c.slug, name: c.name, email: c.email, avatarUrl: c.avatarUrl }
         : null,
      pinned: d.pinned,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
      descriptionDoc: (d.descriptionDoc as EditorDoc | null) ?? null,
      descriptionVersion: descriptionVersionOf(d.descriptionDoc),
   };
}

export interface UpdateDocumentInput {
   name?: string;
   icon?: string | null;
   pinned?: boolean;
   /** Corpo do documento (editor de blocos). Doc vazio limpa. */
   descriptionDoc?: EditorDoc | null;
   /** Concorrência otimista do corpo: versão vista. Ausente → last-write-wins. */
   expectedDescriptionVersion?: string | null;
}

/**
 * Metadados (nome, ícone, pin) continuam só do criador ou admin. O CORPO é do time:
 * qualquer membro edita (como no Linear), com concorrência otimista pela versão.
 * Devolve o documento atualizado (null se não existir).
 */
export async function updateDocument(
   db: Db,
   id: string,
   patch: UpdateDocumentInput,
   actorEmail: string
): Promise<DocumentDetailDto | null> {
   const current = await getDocument(db, id);
   if (!current) return null;
   const teamId = current.teamId;
   const touchesMeta =
      patch.name !== undefined || patch.icon !== undefined || patch.pinned !== undefined;
   if (touchesMeta) await assertDocumentOwner(db, id, actorEmail);
   if (patch.descriptionDoc !== undefined && !(await isAdmin(actorEmail, db)))
      await assertTeamMember(db, teamId, actorEmail);

   const set: Partial<typeof teamDocument.$inferInsert> = { updatedAt: new Date() };
   if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ApiError(400, 'name é obrigatório');
      set.name = name;
   }
   if (patch.icon !== undefined) set.icon = patch.icon?.trim() || null;
   if (patch.pinned !== undefined) set.pinned = patch.pinned;
   if (patch.descriptionDoc !== undefined)
      set.descriptionDoc = projectDescriptionDoc(patch.descriptionDoc).doc;

   const updated = await db.transaction(async (tx) => {
      if (set.descriptionDoc !== undefined && patch.expectedDescriptionVersion) {
         // Checagem e gravação atômicas: serializa escritas no mesmo documento.
         const [cur] = await tx
            .select({ doc: teamDocument.descriptionDoc })
            .from(teamDocument)
            .where(eq(teamDocument.id, id))
            .for('update');
         if (cur && descriptionVersionOf(cur.doc) !== patch.expectedDescriptionVersion)
            throw new ApiError(409, 'O documento foi alterado por outra pessoa');
      }
      return tx
         .update(teamDocument)
         .set(set)
         .where(eq(teamDocument.id, id))
         .returning({ id: teamDocument.id });
   });
   if (updated.length === 0) return null;
   publish({ entity: 'document', action: 'updated', id, actorEmail, teamId });
   return getDocument(db, id);
}

export async function deleteDocument(db: Db, id: string, actorEmail: string): Promise<boolean> {
   const teamId = await assertDocumentOwner(db, id, actorEmail);
   if (!teamId) return false;
   const res = await db
      .delete(teamDocument)
      .where(eq(teamDocument.id, id))
      .returning({ id: teamDocument.id });
   if (res.length > 0) publish({ entity: 'document', action: 'deleted', id, actorEmail, teamId });
   return res.length > 0;
}

/** Pasta onde nascem os documentos criados a partir de um projeto. */
export const PROJECT_DOCUMENTS_FOLDER = 'Projects';
const PROJECT_DOC_SUFFIX = ' — doc';
const NAME_MAX = 196;
/** Segmento `[orgId]` da rota: só slug, para o link salvo não virar caminho arbitrário. */
const ORG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface ProjectDocumentDto {
   document: DocumentDto & { teamId: string; url: string };
   resource: ProjectResourceDto;
}

/**
 * "Create document…" do Resources do projeto: cria um documento no time do projeto e o
 * vincula como resource (link para a página interna do documento). Pasta: a "Projects"
 * do time; sem ela, a primeira pasta do time; sem nenhuma, cria "Projects". Tudo numa
 * transação: se o vínculo falhar, nem documento nem pasta nova ficam órfãos.
 * Exige o projeto no escopo do ator e ser membro do time (mesma regra de criar documento).
 */
export async function createProjectDocument(
   db: Db,
   projectId: string,
   input: { orgId: string },
   actorEmail: string
): Promise<ProjectDocumentDto> {
   if (!ORG_ID_RE.test(input.orgId ?? '')) throw new ApiError(400, 'orgId inválido');
   const [proj] = await db
      .select({ name: projectT.name, teamId: projectT.teamId })
      .from(projectT)
      .where(eq(projectT.id, projectId))
      .limit(1);
   if (!proj) throw new ApiError(404, `Project '${projectId}' não encontrado`);
   await assertCanWriteProject(db, actorEmail, projectId);
   const creator = await assertTeamMember(db, proj.teamId, actorEmail);

   const folders = await db
      .select({ id: documentFolder.id, name: documentFolder.name })
      .from(documentFolder)
      .where(eq(documentFolder.teamId, proj.teamId))
      .orderBy(asc(documentFolder.name));
   const existing =
      folders.find((f) => f.name.trim().toLowerCase() === PROJECT_DOCUMENTS_FOLDER.toLowerCase()) ??
      folders[0];
   const folderId = existing?.id ?? randomUUID();

   const name = `${proj.name.trim().slice(0, NAME_MAX - PROJECT_DOC_SUFFIX.length)}${PROJECT_DOC_SUFFIX}`;
   const id = randomUUID();
   const resourceId = randomUUID();
   const url = `/${input.orgId}/team/${proj.teamId}/documents/${id}`;
   const now = new Date();
   await db.transaction(async (tx) => {
      if (!existing)
         await tx.insert(documentFolder).values({
            id: folderId,
            teamId: proj.teamId,
            name: PROJECT_DOCUMENTS_FOLDER,
            icon: '📁',
         });
      await tx.insert(teamDocument).values({
         id,
         folderId,
         name,
         icon: null,
         creatorId: creator.id,
         pinned: false,
         createdAt: now,
         updatedAt: now,
      });
      await tx.insert(projectResource).values({ id: resourceId, projectId, label: name, url });
   });

   const teamId = proj.teamId;
   if (!existing) publish({ entity: 'document', action: 'created', id: folderId, teamId });
   publish({ entity: 'document', action: 'created', id, actorEmail, teamId });
   publish({ entity: 'project', action: 'updated', id: projectId, actorEmail, teamId });
   return {
      document: {
         id,
         folderId,
         teamId,
         url,
         name,
         icon: null,
         creator: {
            id: creator.id,
            slug: creator.slug,
            name: creator.name,
            email: creator.email,
            avatarUrl: creator.avatarUrl,
         },
         pinned: false,
         createdAt: now.toISOString(),
         updatedAt: now.toISOString(),
      },
      resource: { id: resourceId, label: name, url },
   };
}
