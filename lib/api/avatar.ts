import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, userAvatar } from '@/db/schema';
import { ApiError } from './errors';

/**
 * Foto de perfil (avatar) self-contained: a imagem vive no banco (`user_avatar`,
 * base64) e é servida por `GET /api/v1/users/{id}/avatar`. O `app_user.avatar_url`
 * aponta pra esse endpoint (com cache-bust) enquanto houver foto; ao remover,
 * volta pro avatar gerado (dicebear). Sem S3 nem dependência externa.
 */

/** Content-types aceitos (allow-list) — raster comum, sem SVG (vetor = superfície XSS). */
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Teto do payload base64 (~512KB). O client já redimensiona (canvas ~256px), então
 * o normal fica em poucos KB; o cap é a barreira server-side contra abuso — nunca
 * confiar no tamanho do arquivo original.
 */
export const MAX_AVATAR_BASE64_BYTES = 512 * 1024;

export interface AvatarBytes {
   data: string; // base64 (payload do data-URL, sem o prefixo `data:...;base64,`)
   contentType: string;
}

/** Endpoint que serve os bytes do avatar do usuário (com cache-bust por versão). */
function avatarEndpoint(userId: string): string {
   return `/api/v1/users/${userId}/avatar?v=${Date.now()}`;
}

/**
 * Extrai o base64 de um data-URL `data:<mime>;base64,<payload>`, validando que o
 * mime declarado no data-URL bate com o `contentType` informado. Aceita também um
 * base64 puro (sem prefixo) desde que o `contentType` seja da allow-list.
 */
function extractBase64(dataUrl: string, contentType: string): string {
   const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl.trim());
   if (match) {
      const mime = match[1].toLowerCase();
      if (mime !== contentType) {
         throw new ApiError(400, 'contentType não corresponde ao data-URL');
      }
      return match[2];
   }
   // Sem prefixo data-URL → trata como base64 puro.
   return dataUrl.trim();
}

/** true se a string é base64 canônico (alfabeto + padding correto). */
function isValidBase64(s: string): boolean {
   if (s.length === 0 || s.length % 4 !== 0) return false;
   return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

/**
 * Grava (upsert) a foto de perfil do usuário e aponta o `avatar_url` pro endpoint
 * de servir. Valida content-type (allow-list), formato base64 e tamanho (cap).
 * Retorna a nova `avatarUrl`.
 */
export async function setAvatar(
   db: Db,
   userId: string,
   dataUrl: string,
   contentType: string
): Promise<string> {
   const ct = contentType.trim().toLowerCase();
   if (!ALLOWED_CONTENT_TYPES.has(ct)) {
      throw new ApiError(400, 'Tipo de imagem não suportado (use png, jpeg ou webp)');
   }
   const base64 = extractBase64(dataUrl, ct);
   if (!isValidBase64(base64)) {
      throw new ApiError(400, 'Imagem inválida (base64 malformado)');
   }
   if (Buffer.byteLength(base64, 'utf8') > MAX_AVATAR_BASE64_BYTES) {
      throw new ApiError(413, 'Imagem excede o tamanho máximo (512KB)');
   }

   // Guarda de existência ANTES do insert em user_avatar (que tem FK pro app_user):
   // sem isso, um userId inexistente estouraria FK violation opaca em vez de 404.
   const exists = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
   if (exists.length === 0) throw new ApiError(404, 'Usuário não encontrado');

   const now = new Date();
   await db
      .insert(userAvatar)
      .values({ userId, data: base64, contentType: ct, updatedAt: now })
      .onConflictDoUpdate({
         target: userAvatar.userId,
         set: { data: base64, contentType: ct, updatedAt: now },
      });

   const avatarUrl = avatarEndpoint(userId);
   await db.update(appUser).set({ avatarUrl, updatedAt: now }).where(eq(appUser.id, userId));
   return avatarUrl;
}

/** Lê os bytes do avatar do usuário (base64 + content-type). null se não houver foto. */
export async function getAvatar(db: Db, userId: string): Promise<AvatarBytes | null> {
   const rows = await db
      .select({ data: userAvatar.data, contentType: userAvatar.contentType })
      .from(userAvatar)
      .where(eq(userAvatar.userId, userId))
      .limit(1);
   return rows.length > 0 ? rows[0] : null;
}

/**
 * Remove a foto de perfil: apaga os bytes e zera o `avatar_url` (→ null). Sem foto,
 * a UI renderiza as iniciais coloridas do usuário (AvatarFallback).
 */
export async function deleteAvatar(db: Db, userId: string): Promise<void> {
   const rows = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
   if (rows.length === 0) throw new ApiError(404, 'Usuário não encontrado');

   await db.delete(userAvatar).where(eq(userAvatar.userId, userId));
   await db
      .update(appUser)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(appUser.id, userId));
}
