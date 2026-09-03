import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Storage de assets (custom emojis) no S3, servidos via CloudFront (CDN).
 * Credenciais = IRSA (Web Identity Token do pod), igual ao SES/Bedrock.
 * Config por env: CIRCLE_ASSETS_BUCKET + CIRCLE_CDN_URL.
 */
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const BUCKET = process.env.CIRCLE_ASSETS_BUCKET ?? '';
const CDN_URL = (process.env.CIRCLE_CDN_URL ?? '').replace(/\/$/, '');

let _s3: S3Client | null = null;
function s3(): S3Client {
   _s3 ??= new S3Client({ region: REGION });
   return _s3;
}

export function assetsConfigured(): boolean {
   return Boolean(BUCKET && CDN_URL);
}

export interface PutAssetOptions {
   /** `Content-Disposition` do objeto (ex.: `attachment; filename="x.pdf"` pra forçar download). */
   contentDisposition?: string;
}

/** Sobe um asset no S3 e devolve a URL pública via CDN. Cache imutável (1 ano). */
export async function putAsset(
   key: string,
   body: Buffer,
   contentType: string,
   options: PutAssetOptions = {}
): Promise<string> {
   if (!assetsConfigured()) throw new Error('Assets bucket/CDN não configurados (env)');
   await s3().send(
      new PutObjectCommand({
         Bucket: BUCKET,
         Key: key,
         Body: body,
         ContentType: contentType,
         CacheControl: 'public, max-age=31536000, immutable',
         ...(options.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}),
      })
   );
   return `${CDN_URL}/${key}`;
}

/** Chave do objeto a partir da URL pública (CDN); null se a URL não é deste CDN. */
export function assetKeyFromUrl(url: string): string | null {
   if (!CDN_URL || !url.startsWith(`${CDN_URL}/`)) return null;
   return url.slice(CDN_URL.length + 1) || null;
}

export async function deleteAsset(key: string): Promise<void> {
   if (!assetsConfigured()) return;
   await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
