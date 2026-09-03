import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   attachment as attachmentT,
   comment as commentT,
   issue as issueT,
   appUser,
} from '@/db/schema';
import { isAdmin } from './auth';
import { ApiError } from './errors';
import { publish } from './events';
import type { UserRef } from './issues';
import { assetKeyFromUrl, assetsConfigured, deleteAsset, putAsset } from './s3-assets';
import { getOrCreateUser } from './users';
import { MAX_ATTACHMENT_BYTES, resolveAttachmentType } from '@/lib/attachment-types';

/**
 * Anexos de issue e de comentário (#98). O arquivo vai pro mesmo bucket/CDN dos uploads
 * do editor (`uploads/<uuid>.<ext>`); a linha em `attachment` guarda os metadados.
 * Não-imagens sobem com `Content-Disposition: attachment` (download, nunca render inline).
 */

export interface AttachmentDto {
   id: string;
   issueId: string;
   /** null = anexo da issue; senão, do comentário. */
   commentId: string | null;
   url: string;
   fileName: string;
   contentType: string;
   size: number;
   uploadedBy: UserRef | null;
   createdAt: string;
}

export interface AttachmentFile {
   name: string;
   type: string;
   bytes: Buffer;
}

export interface CreateAttachmentInput {
   issueId: string;
   commentId?: string | null;
   file: AttachmentFile;
}

type Row = typeof attachmentT.$inferSelect;

function toIso(d: unknown): string {
   return d instanceof Date ? d.toISOString() : String(d);
}

async function usersById(db: Db, ids: string[]) {
   const uniq = [...new Set(ids)];
   if (uniq.length === 0) return new Map<string, typeof appUser.$inferSelect>();
   const rows = await db.select().from(appUser).where(inArray(appUser.id, uniq));
   return new Map(rows.map((u) => [u.id, u]));
}

async function toDtos(db: Db, rows: Row[]): Promise<AttachmentDto[]> {
   const users = await usersById(
      db,
      rows.map((r) => r.uploadedById)
   );
   return rows.map((r) => {
      const u = users.get(r.uploadedById);
      return {
         id: r.id,
         issueId: r.issueId,
         commentId: r.commentId ?? null,
         url: r.url,
         fileName: r.fileName,
         contentType: r.contentType,
         size: r.size,
         uploadedBy: u
            ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
            : null,
         createdAt: toIso(r.createdAt),
      };
   });
}

/** Sobe o arquivo e grava o anexo. 400 tipo recusado · 413 acima de 25 MB · 404 issue/comentário. */
export async function createAttachment(
   db: Db,
   input: CreateAttachmentInput,
   actorEmail: string
): Promise<AttachmentDto> {
   if (!assetsConfigured())
      throw new ApiError(503, 'Storage de anexos não configurado (bucket/CDN)');

   const fileName = input.file.name.trim().slice(0, 255);
   if (!fileName) throw new ApiError(400, 'Nome do arquivo é obrigatório');
   const type = resolveAttachmentType(fileName, input.file.type);
   if (!type) throw new ApiError(400, 'Tipo de arquivo não permitido');
   if (input.file.bytes.length === 0) throw new ApiError(400, 'Arquivo vazio');
   if (input.file.bytes.length > MAX_ATTACHMENT_BYTES)
      throw new ApiError(413, 'Arquivo excede o tamanho máximo (25 MB)');

   const [iss] = await db
      .select({ id: issueT.id })
      .from(issueT)
      .where(eq(issueT.id, input.issueId))
      .limit(1);
   if (!iss) throw new ApiError(404, `Issue '${input.issueId}' não encontrada`);
   if (input.commentId) {
      const [c] = await db
         .select({ issueId: commentT.issueId })
         .from(commentT)
         .where(eq(commentT.id, input.commentId))
         .limit(1);
      if (!c || c.issueId !== input.issueId)
         throw new ApiError(404, 'Comentário não encontrado nesta issue');
   }

   const actor = await getOrCreateUser(db, actorEmail);
   const key = `uploads/${randomUUID()}.${type.ext}`;
   // Imagem renderiza inline (miniatura/preview); o resto força download.
   const contentDisposition =
      type.kind === 'image'
         ? undefined
         : `attachment; filename="${fileName.replace(/["\r\n\\]/g, '_')}"`;
   const url = await putAsset(key, input.file.bytes, type.contentType, { contentDisposition });

   const row: Row = {
      id: randomUUID(),
      issueId: input.issueId,
      commentId: input.commentId ?? null,
      uploadedById: actor.id,
      url,
      fileName,
      contentType: type.contentType,
      size: input.file.bytes.length,
      createdAt: new Date(),
   };
   await db.insert(attachmentT).values(row);
   publishFor(row, 'updated', actorEmail);
   return (await toDtos(db, [row]))[0];
}

/** Anexos da issue (só os da issue, sem os de comentário), mais antigos primeiro. */
export async function listIssueAttachments(db: Db, issueId: string): Promise<AttachmentDto[]> {
   const rows = await db
      .select()
      .from(attachmentT)
      .where(and(eq(attachmentT.issueId, issueId), isNull(attachmentT.commentId)))
      .orderBy(asc(attachmentT.createdAt));
   return toDtos(db, rows);
}

/** Anexos agrupados por comentário (pro feed). */
export async function attachmentsByComment(
   db: Db,
   commentIds: string[]
): Promise<Map<string, AttachmentDto[]>> {
   const map = new Map<string, AttachmentDto[]>();
   if (commentIds.length === 0) return map;
   const rows = await db
      .select()
      .from(attachmentT)
      .where(inArray(attachmentT.commentId, commentIds))
      .orderBy(asc(attachmentT.createdAt));
   for (const dto of await toDtos(db, rows)) {
      const list = map.get(dto.commentId!) ?? [];
      list.push(dto);
      map.set(dto.commentId!, list);
   }
   return map;
}

/** Remove um anexo. Só quem subiu ou admin (403). false = não existe. S3 em best-effort. */
export async function deleteAttachment(db: Db, id: string, actorEmail: string): Promise<boolean> {
   const [row] = await db.select().from(attachmentT).where(eq(attachmentT.id, id)).limit(1);
   if (!row) return false;
   const actor = await getOrCreateUser(db, actorEmail);
   if (row.uploadedById !== actor.id && !(await isAdmin(actorEmail, db)))
      throw new ApiError(403, 'Só quem anexou (ou admin) pode remover o anexo');
   await db.delete(attachmentT).where(eq(attachmentT.id, id));
   void removeFromStorage([row.url]);
   publishFor(row, 'updated', actorEmail);
   return true;
}

/**
 * Apaga as linhas de anexo dos comentários dados (usado pelo `deleteComment`) e limpa o
 * S3 em best-effort. Não publica evento — o chamador já publica o do comentário.
 */
export async function deleteAttachmentsOfComments(db: Db, commentIds: string[]): Promise<void> {
   if (commentIds.length === 0) return;
   const rows = await db
      .delete(attachmentT)
      .where(inArray(attachmentT.commentId, commentIds))
      .returning({ url: attachmentT.url });
   void removeFromStorage(rows.map((r) => r.url));
}

async function removeFromStorage(urls: string[]): Promise<void> {
   for (const url of urls) {
      const key = assetKeyFromUrl(url);
      if (!key) continue;
      try {
         await deleteAsset(key);
      } catch (e) {
         console.warn('[circle] falha ao remover anexo do S3 (best-effort):', key, e);
      }
   }
}

/** Anexo de comentário → evento `comment` (id do comentário); da issue → `issue`. */
function publishFor(row: Row, action: 'updated', actorEmail: string): void {
   if (row.commentId) publish({ entity: 'comment', action, id: row.commentId, actorEmail });
   else publish({ entity: 'issue', action, id: row.issueId, actorEmail });
}
