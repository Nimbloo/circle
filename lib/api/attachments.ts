import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { attachment, issue as issueT, appUser } from '@/db/schema';
import { ApiError } from './errors';

/**
 * Anexos self-contained (mesmo padrão do avatar): os bytes vivem no banco em base64;
 * o detail carrega só o METADADO e os bytes saem por `GET .../attachments/{aid}`.
 * SVG é bloqueado (vetor = superfície de XSS). Cap de ~7MB de base64 (~5MB de arquivo).
 */
export const MAX_ATTACHMENT_BASE64_BYTES = 7 * 1024 * 1024;

export interface AttachmentDto {
   id: string;
   name: string;
   contentType: string;
   size: number;
   /** Endpoint que serve os bytes (com cache-bust). */
   url: string;
}

export interface AttachmentBytes {
   data: string; // base64 (sem prefixo)
   contentType: string;
   name: string;
}

function attachmentEndpoint(issueId: string, id: string): string {
   return `/api/v1/issues/${issueId}/attachments/${id}`;
}

/** Extrai o base64 de `data:<mime>;base64,<payload>` validando o mime declarado. */
function extractBase64(dataUrl: string, contentType: string): string {
   const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl.trim());
   if (match) {
      if (match[1].toLowerCase() !== contentType.toLowerCase()) {
         throw new ApiError(400, 'contentType não corresponde ao data-URL');
      }
      return match[2];
   }
   return dataUrl.trim();
}

function isValidBase64(s: string): boolean {
   if (s.length === 0 || s.length % 4 !== 0) return false;
   return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

/** Metadados dos anexos de uma issue (SEM o blob). Usado no detail. */
export async function listAttachments(db: Db, issueId: string): Promise<AttachmentDto[]> {
   const rows = await db
      .select({
         id: attachment.id,
         name: attachment.name,
         contentType: attachment.contentType,
         size: attachment.size,
      })
      .from(attachment)
      .where(eq(attachment.issueId, issueId))
      .orderBy(asc(attachment.createdAt));
   return rows.map((r) => ({ ...r, url: attachmentEndpoint(issueId, r.id) }));
}

export interface AddAttachmentInput {
   name: string;
   contentType: string;
   dataUrl: string;
}

/** Grava um anexo (base64 no banco). Valida tipo (sem SVG), base64 e tamanho. */
export async function addAttachment(
   db: Db,
   issueId: string,
   input: AddAttachmentInput,
   actorEmail: string
): Promise<AttachmentDto> {
   const found = await db.select({ id: issueT.id }).from(issueT).where(eq(issueT.id, issueId)).limit(1);
   if (found.length === 0) throw new ApiError(404, `Issue '${issueId}' não encontrada`);

   const ct = input.contentType.trim().toLowerCase();
   if (!ct || ct === 'image/svg+xml' || ct.includes('svg')) {
      throw new ApiError(400, 'Tipo de arquivo não suportado (SVG bloqueado)');
   }
   if (!input.name?.trim()) throw new ApiError(400, 'name é obrigatório');

   const base64 = extractBase64(input.dataUrl, ct);
   if (!isValidBase64(base64)) throw new ApiError(400, 'Arquivo inválido (base64 malformado)');
   if (Buffer.byteLength(base64, 'utf8') > MAX_ATTACHMENT_BASE64_BYTES) {
      throw new ApiError(413, 'Arquivo excede o tamanho máximo (5MB)');
   }
   const size = Math.floor((base64.length * 3) / 4); // bytes aproximados do arquivo

   const uploader = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, actorEmail))
      .limit(1);

   const id = randomUUID();
   await db.insert(attachment).values({
      id,
      issueId,
      uploaderId: uploader[0]?.id ?? null,
      name: input.name.trim().slice(0, 512),
      contentType: ct,
      size,
      data: base64,
   });
   return { id, name: input.name.trim().slice(0, 512), contentType: ct, size, url: attachmentEndpoint(issueId, id) };
}

/** Lê os bytes de um anexo (para o endpoint de servir). null se não existir. */
export async function getAttachmentBytes(db: Db, id: string): Promise<AttachmentBytes | null> {
   const rows = await db
      .select({ data: attachment.data, contentType: attachment.contentType, name: attachment.name })
      .from(attachment)
      .where(eq(attachment.id, id))
      .limit(1);
   return rows.length > 0 ? rows[0] : null;
}

export async function removeAttachment(db: Db, id: string): Promise<boolean> {
   const res = await db
      .delete(attachment)
      .where(eq(attachment.id, id))
      .returning({ id: attachment.id });
   return res.length > 0;
}
