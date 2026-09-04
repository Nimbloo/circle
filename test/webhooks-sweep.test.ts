import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { webhookDelivery } from '@/db/schema';
import {
   createWebhook,
   onCircleEvent,
   sweepWebhookDeliveries,
   updateWebhook,
} from '@/lib/api/webhooks';

/**
 * Starvation do sweep (auditoria v0.29.0): 60 entregas falhadas de um webhook
 * DESABILITADO enchiam o lote de 50 (ordenado por `createdAt asc`) e o `continue` as
 * pulava sem consumi-las — o retry de TODOS os outros webhooks morria para sempre.
 * E o sweep rodava a cada `publish`, custando queries mesmo sem webhook cadastrado.
 */

let db: Db;
let ownerId: string;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   ownerId = await seedUser(db, { name: 'Owner', email: 'owner@circle.dev', teamIds: ['CORE'] });
});

/** Entrega falhada, pronta para retry, com data controlada (fila FIFO). */
async function queueFailed(webhookId: string, createdAt: Date) {
   await db.insert(webhookDelivery).values({
      id: randomUUID(),
      webhookId,
      event: 'issue.updated',
      payload: { event: 'issue.updated' },
      status: 'failed',
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 60_000),
      createdAt,
      updatedAt: createdAt,
   });
}

describe('sweep de webhooks', () => {
   it('entrega de webhook desabilitado não ocupa o lote', async () => {
      const morto = await createWebhook(
         db,
         { url: 'https://exemplo.invalid/morto', events: ['issue.updated'] },
         ownerId
      );
      const vivo = await createWebhook(
         db,
         { url: 'https://exemplo.invalid/vivo', events: ['issue.updated'] },
         ownerId
      );
      await updateWebhook(db, morto.id, { enabled: false });

      // 60 entregas ANTIGAS do webhook desligado + 1 recente do ligado.
      for (let i = 0; i < 60; i++) {
         await queueFailed(morto.id, new Date(Date.UTC(2026, 0, 1, 0, i)));
      }
      await queueFailed(vivo.id, new Date(Date.UTC(2026, 0, 2)));

      const tentativas: string[] = [];
      const fetchSpy: typeof fetch = async (input) => {
         tentativas.push(String(input));
         return new Response(null, { status: 200 });
      };

      // Lote de 50: antes, as 50 primeiras eram do webhook morto e a do vivo nem
      // chegava a ser considerada.
      expect(await sweepWebhookDeliveries(db, fetchSpy, 50)).toBe(1);
      expect(tentativas).toEqual(['https://exemplo.invalid/vivo']);

      // As entregas do webhook desligado continuam no banco, esperando religarem.
      const presas = await db
         .select()
         .from(webhookDelivery)
         .where(eq(webhookDelivery.webhookId, morto.id));
      expect(presas).toHaveLength(60);
      expect(presas.every((d) => d.status === 'failed')).toBe(true);
   });

   it('religar o webhook devolve as entregas presas ao lote', async () => {
      const hook = await createWebhook(
         db,
         { url: 'https://exemplo.invalid/hook', events: ['issue.updated'] },
         ownerId
      );
      await updateWebhook(db, hook.id, { enabled: false });
      await queueFailed(hook.id, new Date(Date.UTC(2026, 0, 1)));

      const ok: typeof fetch = async () => new Response(null, { status: 200 });
      expect(await sweepWebhookDeliveries(db, ok, 50)).toBe(0);

      await updateWebhook(db, hook.id, { enabled: true });
      expect(await sweepWebhookDeliveries(db, ok, 50)).toBe(1);
   });

   it('publish sem webhook assinante não varre nada', async () => {
      let queries = 0;
      const counting = new Proxy(db, {
         get(target, prop, receiver) {
            if (prop === 'select' || prop === 'execute') queries++;
            return Reflect.get(target, prop, receiver);
         },
      }) as Db;

      await onCircleEvent(counting, { entity: 'issue', action: 'updated', id: 'i-1' });
      // Uma única leitura: a dos webhooks assinantes. Sem assinante, sem sweep.
      expect(queries).toBe(1);
   });
});
