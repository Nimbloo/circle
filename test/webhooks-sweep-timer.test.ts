import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { webhook as webhookT, webhookDelivery } from '@/db/schema';
import { startWebhookSweepTimer } from '@/lib/api/webhooks';

/**
 * #55: retry de webhook dependia de TRÁFEGO (sweep só em `publish`/GET da tela). Um pod
 * ocioso deixava entregas falhadas paradas para sempre. Agora cada pod tem um timer.
 */
let db: Db;
let stop: (() => void) | undefined;

beforeEach(async () => {
   vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', 'true');
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   const ownerId = await seedUser(db, { name: 'O', email: 'o@circle.dev', teamIds: ['CORE'] });
   const id = randomUUID();
   await db.insert(webhookT).values({
      id,
      url: 'https://exemplo.invalid/hook',
      secret: 's',
      events: ['issue.updated'],
      enabled: true,
      createdBy: ownerId,
   });
   await db.insert(webhookDelivery).values({
      id: randomUUID(),
      webhookId: id,
      event: 'issue.updated',
      payload: { event: 'issue.updated' },
      status: 'failed',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 60_000),
   });
});
afterEach(() => {
   stop?.();
   vi.unstubAllEnvs();
});

describe('sweep de webhooks por timer (#55)', () => {
   it('sem nenhum publish, o timer do pod retenta a entrega vencida', async () => {
      const chamadas: string[] = [];
      const fetchSpy: typeof fetch = async (input) => {
         chamadas.push(String(input));
         return new Response(null, { status: 200 });
      };
      stop = startWebhookSweepTimer(db, { intervalMs: 20, fetchImpl: fetchSpy });
      await vi.waitFor(() => expect(chamadas).toEqual(['https://exemplo.invalid/hook']), {
         timeout: 5000,
      });
   });

   it('é idempotente por processo: segunda chamada não cria outro timer', () => {
      stop = startWebhookSweepTimer(db, { intervalMs: 60_000 });
      const again = startWebhookSweepTimer(db, { intervalMs: 60_000 });
      expect(again).toBe(stop);
   });
});
