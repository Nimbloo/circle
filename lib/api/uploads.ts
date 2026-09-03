import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';
import { assetsConfigured, putAsset } from './s3-assets';

/**
 * Upload de imagens do editor de blocos (#16): mesmo bucket/CDN dos avatares e emojis,
 * chave `uploads/<uuid>.<ext>`. Sem tabela — a URL vive no documento que a referencia.
 */

/** Allow-list de content-types (raster comum, sem SVG = superfície XSS). */
const ALLOWED = new Map<string, string>([
   ['image/png', 'png'],
   ['image/jpeg', 'jpg'],
   ['image/webp', 'webp'],
   ['image/gif', 'gif'],
]);

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface UploadInput {
   dataUrl: string;
   contentType: string;
   fileName?: string | null;
}

export interface UploadDto {
   url: string;
}

function decodeBase64(dataUrl: string, contentType: string): Buffer {
   const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
   if (m && m[1].toLowerCase() !== contentType) {
      throw new ApiError(400, 'contentType não corresponde ao data-URL');
   }
   return Buffer.from(m ? m[2] : dataUrl.trim(), 'base64');
}

export async function uploadImage(input: UploadInput): Promise<UploadDto> {
   if (!assetsConfigured())
      throw new ApiError(503, 'Storage de uploads não configurado (bucket/CDN)');

   const ct = input.contentType.trim().toLowerCase();
   const ext = ALLOWED.get(ct);
   if (!ext) throw new ApiError(400, 'Tipo de imagem não suportado (png, jpeg, webp, gif)');

   const buf = decodeBase64(input.dataUrl, ct);
   if (buf.length === 0) throw new ApiError(400, 'Imagem inválida');
   if (buf.length > MAX_UPLOAD_BYTES)
      throw new ApiError(413, 'Imagem excede o tamanho máximo (5 MB)');

   const key = `uploads/${randomUUID()}.${ext}`;
   return { url: await putAsset(key, buf, ct) };
}
