import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { customEmoji as emojiT } from '@/db/schema';
import { ApiError } from './errors';
import { putAsset, deleteAsset, assetsConfigured } from './s3-assets';

const ALLOWED = new Map<string, string>([
   ['image/png', 'png'],
   ['image/jpeg', 'jpg'],
   ['image/webp', 'webp'],
   ['image/gif', 'gif'],
]);
const MAX_BYTES = 256 * 1024; // 256KB — emojis são pequenos

export interface EmojiDto {
   id: string;
   shortcode: string;
   url: string;
}

type EmojiRow = typeof emojiT.$inferSelect;
const toDto = (r: EmojiRow): EmojiDto => ({ id: r.id, shortcode: r.shortcode, url: r.url });

/** :code: → 'code' (minúsculo, só [a-z0-9_]). Máx 30 chars — `:code:` cabe em varchar(32) da reação. */
export function normalizeShortcode(s: string): string {
   return s
      .trim()
      .toLowerCase()
      .replace(/^:+|:+$/g, '')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30);
}

function decodeBase64(dataUrl: string): Buffer {
   const m = /^data:[^;,]+;base64,([\s\S]+)$/.exec(dataUrl.trim());
   return Buffer.from(m ? m[1] : dataUrl.trim(), 'base64');
}

export async function listEmojis(db: Db): Promise<EmojiDto[]> {
   const rows = await db.select().from(emojiT).orderBy(asc(emojiT.shortcode));
   return rows.map(toDto);
}

export interface CreateEmojiInput {
   shortcode: string;
   dataUrl: string;
   contentType: string;
   createdBy?: string | null;
}

export async function createEmoji(db: Db, input: CreateEmojiInput): Promise<EmojiDto> {
   if (!assetsConfigured())
      throw new ApiError(503, 'Storage de emojis não configurado (bucket/CDN)');

   const code = normalizeShortcode(input.shortcode);
   if (!code) throw new ApiError(400, 'Shortcode inválido (use letras, números, _)');

   const ct = input.contentType.trim().toLowerCase();
   const ext = ALLOWED.get(ct);
   if (!ext) throw new ApiError(400, 'Tipo de imagem não suportado (png, jpeg, webp, gif)');

   const buf = decodeBase64(input.dataUrl);
   if (buf.length === 0) throw new ApiError(400, 'Imagem inválida');
   if (buf.length > MAX_BYTES) throw new ApiError(413, 'Imagem excede o tamanho máximo (256KB)');

   const dup = await db
      .select({ id: emojiT.id })
      .from(emojiT)
      .where(eq(emojiT.shortcode, code))
      .limit(1);
   if (dup.length > 0) throw new ApiError(409, `Emoji :${code}: já existe`);

   const id = randomUUID();
   const key = `emojis/${id}.${ext}`;
   const url = await putAsset(key, buf, ct);
   await db.insert(emojiT).values({
      id,
      shortcode: code,
      s3Key: key,
      url,
      contentType: ct,
      createdBy: input.createdBy ?? null,
   });
   const [row] = await db.select().from(emojiT).where(eq(emojiT.id, id)).limit(1);
   return toDto(row);
}

export async function deleteEmoji(db: Db, id: string): Promise<boolean> {
   const [row] = await db.select().from(emojiT).where(eq(emojiT.id, id)).limit(1);
   if (!row) return false;
   await deleteAsset(row.s3Key).catch(() => undefined); // best-effort no S3
   await db.delete(emojiT).where(eq(emojiT.id, id));
   return true;
}
