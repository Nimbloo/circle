import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import {
   attemptDelivery,
   createWebhook,
   isBlockedHostname,
   isPrivateAddress,
   listDeliveries,
   updateWebhook,
} from '@/lib/api/webhooks';
import { webhook as webhookT, webhookDelivery } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * ANTI-SSRF NO WEBHOOK (#101).
 *
 * A auditoria criou um webhook para `http://169.254.169.254/latest/meta-data/` e
 * recebeu 200: o `assertValid` só olhava o protocolo. Com o `responseCode`/`lastError`
 * das entregas, isso vira um scanner da rede interna operado pela própria aplicação.
 */

let db: Db;
let ownerId = '';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   ownerId = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['OPEN'] });
});
afterEach(() => {
   __setTestDb(null);
   vi.unstubAllEnvs();
});

describe('classificação de destino', () => {
   it('reconhece os intervalos privados, link-local e mapeados', () => {
      for (const ip of [
         '127.0.0.1',
         '10.1.2.3',
         '172.16.0.1',
         '172.31.255.255',
         '192.168.0.1',
         '169.254.169.254', // metadata do EC2 (IMDS)
         '100.64.0.1', // CGNAT
         '0.0.0.0',
         '::1',
         'fd00::1',
         'fe80::1',
         '::ffff:169.254.169.254',
      ])
         expect(isPrivateAddress(ip), ip).toBe(true);

      for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'])
         expect(isPrivateAddress(ip), ip).toBe(false);
   });

   it('bloqueia nomes que só existem na rede interna', () => {
      for (const h of [
         'localhost',
         'redis.local',
         'db.internal',
         'circle.dcr.svc.cluster.local',
         'grafana.monitoring.svc',
      ])
         expect(isBlockedHostname(h), h).toBe(true);
      expect(isBlockedHostname('hooks.slack.com')).toBe(false);
   });
});

describe('criar e editar webhook recusa destino interno', () => {
   const events = ['issue.created'] as const;

   it('IMDS, loopback, RFC1918 e DNS de cluster → 400', async () => {
      for (const url of [
         'http://169.254.169.254/latest/meta-data/',
         'http://127.0.0.1:8080/x',
         'http://10.0.0.5/x',
         'http://192.168.1.1/x',
         'http://[::1]:9000/x',
         'http://circle-postgres.dcr.svc.cluster.local:5432/x',
      ]) {
         await expect(
            createWebhook(db, { url, events: [...events] }, ownerId),
            url
         ).rejects.toMatchObject({ status: 400 });
      }
   });

   it('editar um webhook válido para um destino interno também é recusado', async () => {
      vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', 'true');
      const hook = await createWebhook(
         db,
         { url: 'http://127.0.0.1:9/hook', events: [...events] },
         ownerId
      );
      vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', '');
      await expect(
         updateWebhook(db, hook.id, { url: 'http://169.254.169.254/latest/meta-data/' })
      ).rejects.toMatchObject({ status: 400 });
   });
});

describe('disparo', () => {
   /** Insere a entrega direto na tabela — sem passar pela validação de criação. */
   async function seedDelivery(url: string) {
      vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', 'true');
      const hook = await createWebhook(
         db,
         { url: 'http://127.0.0.1:9/hook', events: ['issue.created'] },
         ownerId
      );
      await db.update(webhookT).set({ url }).where(eq(webhookT.id, hook.id));
      vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', '');
      const [row] = await db.select().from(webhookT).where(eq(webhookT.id, hook.id)).limit(1);
      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(webhookDelivery).values({
         id,
         webhookId: hook.id,
         event: 'issue.created',
         payload: { id: 'i1' },
         status: 'pending',
         attempts: 0,
         nextAttemptAt: null,
         responseCode: null,
         lastError: null,
         createdAt: now,
         updatedAt: now,
      });
      const [delivery] = await db
         .select()
         .from(webhookDelivery)
         .where(eq(webhookDelivery.id, id))
         .limit(1);
      return { hook: row, delivery };
   }

   it('destino que virou interno depois do cadastro (DNS rebind) não é chamado', async () => {
      const { hook, delivery } = await seedDelivery('http://169.254.169.254/latest/meta-data/');
      const fetchImpl = vi.fn();
      const ok = await attemptDelivery(db, delivery, hook, fetchImpl as unknown as typeof fetch);
      expect(ok).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
      const [after] = await listDeliveries(db, hook.id);
      expect(after.lastError).toMatch(/Destino não permitido/);
   });

   it('não segue redirect: um 302 para a rede interna morre no 3xx', async () => {
      vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', 'true');
      // Receptor que responde 302 para o IMDS — com `redirect: 'follow'` (o default)
      // o fetch iria buscar o metadata sozinho.
      const server: Server = createServer((_req, res) => {
         res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      try {
         const hook = await createWebhook(
            db,
            { url: `http://127.0.0.1:${port}/hook`, events: ['issue.created'] },
            ownerId
         );
         const [row] = await db.select().from(webhookT).where(eq(webhookT.id, hook.id)).limit(1);
         const id = crypto.randomUUID();
         const now = new Date();
         await db.insert(webhookDelivery).values({
            id,
            webhookId: hook.id,
            event: 'issue.created',
            payload: { id: 'i1' },
            status: 'pending',
            attempts: 0,
            nextAttemptAt: null,
            responseCode: null,
            lastError: null,
            createdAt: now,
            updatedAt: now,
         });
         const [delivery] = await db
            .select()
            .from(webhookDelivery)
            .where(eq(webhookDelivery.id, id))
            .limit(1);
         expect(await attemptDelivery(db, delivery, row)).toBe(false);
         const [after] = await listDeliveries(db, hook.id);
         expect(after.responseCode).toBe(302);
         expect(after.lastError).toMatch(/redirect não seguido/);
      } finally {
         await new Promise<void>((resolve) => server.close(() => resolve()));
      }
   });
});
