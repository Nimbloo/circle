import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import {
   createWebhook,
   deleteWebhook,
   dispatchEvent,
   eventNameFor,
   listDeliveries,
   listWebhooks,
   redeliver,
   signPayload,
   sweepWebhookDeliveries,
   updateWebhook,
   verifySignature,
   MAX_ATTEMPTS,
} from '@/lib/api/webhooks';
import { webhookDelivery } from '@/db/schema';
import { eq } from 'drizzle-orm';

interface Received {
   body: string;
   headers: Record<string, string | undefined>;
}

/** Servidor local que registra o que recebeu e responde com o status pedido. */
async function startReceiver(): Promise<{
   url: string;
   received: Received[];
   setStatus: (code: number) => void;
   close: () => Promise<void>;
}> {
   const received: Received[] = [];
   let status = 200;
   const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
         received.push({ body, headers: req.headers as Record<string, string | undefined> });
         res.writeHead(status).end();
      });
   });
   await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
   const port = (server.address() as AddressInfo).port;
   return {
      url: `http://127.0.0.1:${port}/hook`,
      received,
      setStatus: (code) => (status = code),
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
   };
}

let db: Db;
let receiver: Awaited<ReturnType<typeof startReceiver>>;
let ownerId: string;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   ownerId = await seedUser(db, {
      name: 'Owner',
      email: 'owner@circle.dev',
      teamIds: ['CORE'],
   });
   receiver = await startReceiver();
});
afterEach(async () => {
   await receiver.close();
});

describe('webhooks de saída (#101)', () => {
   it('assina o corpo com HMAC-SHA256 e manda os headers de evento e entrega', async () => {
      const hook = await createWebhook(
         db,
         { url: receiver.url, events: ['issue.created'] },
         ownerId
      );
      expect(hook.secret).toBeTruthy();

      const [deliveryId] = await dispatchEvent(db, 'issue.created', { id: 'i1' });
      expect(receiver.received).toHaveLength(1);

      const got = receiver.received[0];
      expect(got.headers['x-circle-event']).toBe('issue.created');
      expect(got.headers['x-circle-delivery']).toBe(deliveryId);
      expect(got.headers['x-circle-signature']).toBe(signPayload(hook.secret!, got.body));
      expect(verifySignature(hook.secret!, got.body, got.headers['x-circle-signature']!)).toBe(
         true
      );
      expect(verifySignature('outro-segredo', got.body, got.headers['x-circle-signature']!)).toBe(
         false
      );

      const payload = JSON.parse(got.body);
      expect(payload).toMatchObject({ event: 'issue.created', id: 'i1', deliveryId });

      const deliveries = await listDeliveries(db, hook.id);
      expect(deliveries[0].status).toBe('success');
      expect(deliveries[0].responseCode).toBe(200);
      expect(deliveries[0].attempts).toBe(1);
   });

   it('só entrega a quem assina o evento e está habilitado', async () => {
      const subscriber = await createWebhook(
         db,
         { url: receiver.url, events: ['issue.created'] },
         ownerId
      );
      const other = await createWebhook(
         db,
         { url: receiver.url, events: ['project.updated'] },
         ownerId
      );

      await dispatchEvent(db, 'issue.created', { id: 'i1' });
      expect(await listDeliveries(db, subscriber.id)).toHaveLength(1);
      expect(await listDeliveries(db, other.id)).toHaveLength(0);

      await updateWebhook(db, subscriber.id, { enabled: false });
      await dispatchEvent(db, 'issue.created', { id: 'i2' });
      expect(await listDeliveries(db, subscriber.id)).toHaveLength(1);
   });

   it('agenda retry com backoff quando o receptor falha e reenvia no sweep', async () => {
      const hook = await createWebhook(
         db,
         { url: receiver.url, events: ['issue.updated'] },
         ownerId
      );
      receiver.setStatus(500);
      const [deliveryId] = await dispatchEvent(db, 'issue.updated', { id: 'i1' });

      let delivery = (await listDeliveries(db, hook.id))[0];
      expect(delivery.status).toBe('failed');
      expect(delivery.attempts).toBe(1);
      expect(delivery.responseCode).toBe(500);
      expect(delivery.lastError).toBe('HTTP 500');
      expect(delivery.nextAttemptAt).not.toBeNull();

      // Enquanto o backoff não vence, o sweep não toca na entrega.
      expect(await sweepWebhookDeliveries(db)).toBe(0);

      // Vence o backoff e o receptor volta: o sweep reenvia e a entrega fica success.
      await db
         .update(webhookDelivery)
         .set({ nextAttemptAt: new Date(Date.now() - 1000) })
         .where(eq(webhookDelivery.id, deliveryId));
      receiver.setStatus(200);
      expect(await sweepWebhookDeliveries(db)).toBe(1);

      delivery = (await listDeliveries(db, hook.id))[0];
      expect(delivery.status).toBe('success');
      expect(delivery.attempts).toBe(2);
      expect(receiver.received).toHaveLength(2);
   });

   it('esgota após o número máximo de tentativas', async () => {
      const hook = await createWebhook(
         db,
         { url: receiver.url, events: ['issue.deleted'] },
         ownerId
      );
      receiver.setStatus(500);
      const [deliveryId] = await dispatchEvent(db, 'issue.deleted', { id: 'i1' });

      for (let i = 1; i < MAX_ATTEMPTS; i++) {
         await db
            .update(webhookDelivery)
            .set({ nextAttemptAt: new Date(Date.now() - 1000) })
            .where(eq(webhookDelivery.id, deliveryId));
         await sweepWebhookDeliveries(db);
      }

      const delivery = (await listDeliveries(db, hook.id))[0];
      expect(delivery.attempts).toBe(MAX_ATTEMPTS);
      expect(delivery.status).toBe('exhausted');
      expect(delivery.nextAttemptAt).toBeNull();
      // Esgotada, o sweep não a pega mais.
      expect(await sweepWebhookDeliveries(db)).toBe(0);
   });

   it('Redeliver reenvia a entrega esgotada sem criar outra', async () => {
      const hook = await createWebhook(
         db,
         { url: receiver.url, events: ['comment.created'] },
         ownerId
      );
      receiver.setStatus(500);
      const [deliveryId] = await dispatchEvent(db, 'comment.created', { id: 'c1' });

      receiver.setStatus(200);
      const after = await redeliver(db, deliveryId);
      expect(after.status).toBe('success');
      expect(after.attempts).toBe(1);
      expect(await listDeliveries(db, hook.id)).toHaveLength(1);
   });

   it('valida URL e eventos, e apaga o webhook com as entregas', async () => {
      await expect(
         createWebhook(db, { url: 'nao-url', events: ['issue.created'] }, ownerId)
      ).rejects.toThrow(/URL inválida/);
      await expect(createWebhook(db, { url: receiver.url, events: [] }, ownerId)).rejects.toThrow(
         /ao menos um evento/
      );

      const hook = await createWebhook(
         db,
         { url: receiver.url, events: ['issue.created'] },
         ownerId
      );
      await dispatchEvent(db, 'issue.created', { id: 'i1' });
      expect(await deleteWebhook(db, hook.id)).toBe(true);
      expect(await listWebhooks(db)).toHaveLength(0);
      expect(await deleteWebhook(db, hook.id)).toBe(false);
   });

   it('traduz o evento do barramento e ignora entidade sem webhook', () => {
      expect(eventNameFor({ entity: 'issue', action: 'created' })).toBe('issue.created');
      expect(eventNameFor({ entity: 'comment', action: 'created' })).toBe('comment.created');
      expect(eventNameFor({ entity: 'comment', action: 'updated' })).toBeNull();
      expect(eventNameFor({ entity: 'cycle', action: 'created' })).toBeNull();
   });
});
