import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { POST as githubWebhook } from '@/app/api/v1/integrations/github/webhook/route';
import { POST as sentryWebhook } from '@/app/api/v1/integrations/sentry/webhook/route';
import { POST as sentryCreate } from '@/app/api/v1/integrations/sentry/issues/create/route';
import { POST as sentryLink } from '@/app/api/v1/integrations/sentry/issues/link/route';
import { GITHUB_WEBHOOK_MAX_BYTES, SENTRY_WEBHOOK_MAX_BYTES } from '@/lib/api/http';

/**
 * Os webhooks de entrada são as únicas rotas ANÔNIMAS que leem corpo: a assinatura só
 * pode ser conferida depois de ler o corpo inteiro. Sem teto, qualquer um na internet
 * mandava um corpo sem fim e o processo (réplica única) segurava tudo em memória antes
 * de responder 401. O corpo acima do teto morre em 413, e a leitura PARA no teto.
 */

const CHUNK = 64 * 1024;

/** Corpo em stream de `total` bytes; `pulled()` diz quanto o servidor chegou a ler. */
function streamingRequest(url: string, total: number) {
   let sent = 0;
   const body = new ReadableStream<Uint8Array>({
      pull(controller) {
         if (sent >= total) return controller.close();
         const n = Math.min(CHUNK, total - sent);
         sent += n;
         controller.enqueue(new Uint8Array(n).fill(0x61));
      },
   });
   const req = new Request(url, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
   } as RequestInit);
   return { req, pulled: () => sent };
}

beforeEach(() => {
   vi.stubEnv('CIRCLE_GITHUB_WEBHOOK_SECRET', 'gh-secret');
   vi.stubEnv('CIRCLE_SENTRY_CLIENT_SECRET', 'sentry-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('teto de corpo nos webhooks de entrada', () => {
   it('GitHub: corpo acima do teto responde 413 e a leitura para no teto', async () => {
      const { req, pulled } = streamingRequest(
         'http://x/api/v1/integrations/github/webhook',
         GITHUB_WEBHOOK_MAX_BYTES * 2
      );
      const res = await githubWebhook(req);
      expect(res.status).toBe(413);
      expect(pulled()).toBeLessThanOrEqual(GITHUB_WEBHOOK_MAX_BYTES + 2 * CHUNK);
   });

   it('Sentry (webhook, create e link): 413 acima do teto', async () => {
      for (const [path, handler] of [
         ['webhook', sentryWebhook],
         ['issues/create', sentryCreate],
         ['issues/link', sentryLink],
      ] as const) {
         const { req, pulled } = streamingRequest(
            `http://x/api/v1/integrations/sentry/${path}`,
            SENTRY_WEBHOOK_MAX_BYTES * 4
         );
         const res = await handler(req);
         expect(res.status, path).toBe(413);
         expect(pulled(), path).toBeLessThanOrEqual(SENTRY_WEBHOOK_MAX_BYTES + 2 * CHUNK);
      }
   });

   it('corpo dentro do teto segue o fluxo normal (assinatura inválida → 401)', async () => {
      const { req } = streamingRequest('http://x/api/v1/integrations/github/webhook', 1024);
      expect((await githubWebhook(req)).status).toBe(401);
   });

   it('corpo assinado dentro do teto chega íntegro para o HMAC (ping → 200)', async () => {
      const raw = JSON.stringify({ zen: 'Não-ASCII também: ação' });
      const sig = 'sha256=' + createHmac('sha256', 'gh-secret').update(raw, 'utf8').digest('hex');
      const res = await githubWebhook(
         new Request('http://x/api/v1/integrations/github/webhook', {
            method: 'POST',
            body: raw,
            headers: { 'x-hub-signature-256': sig, 'x-github-event': 'ping' },
         })
      );
      expect(res.status).toBe(200);
   });
});
