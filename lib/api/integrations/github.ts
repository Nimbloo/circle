import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação da assinatura do webhook do GitHub (HMAC-SHA256 do body CRU com o
 * webhook secret). GitHub manda `X-Hub-Signature-256: sha256=<hex>`.
 * Retorna false se o secret não está configurado (integração off) ou diverge —
 * nunca lança em runtime por config ausente.
 */
export function signatureFrom(headers: Headers): string | null {
   return headers.get('x-hub-signature-256');
}

export function verifySignature(rawBody: string, signature: string | null | undefined): boolean {
   const secret = process.env.CIRCLE_GITHUB_WEBHOOK_SECRET;
   if (!secret || !signature) return false;
   const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
   const a = Buffer.from(expected, 'utf8');
   const b = Buffer.from(signature, 'utf8');
   if (a.length !== b.length) return false;
   return timingSafeEqual(a, b);
}
