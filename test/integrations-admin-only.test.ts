import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createWebhook, dispatchEvent } from '@/lib/api/webhooks';

import { GET as listHooksRoute, POST as createHookRoute } from '@/app/api/v1/webhooks/route';
import {
   PATCH as patchHookRoute,
   DELETE as deleteHookRoute,
} from '@/app/api/v1/webhooks/[id]/route';
import { GET as deliveriesRoute } from '@/app/api/v1/webhooks/[id]/deliveries/route';
import { POST as redeliverRoute } from '@/app/api/v1/webhooks/deliveries/[deliveryId]/redeliver/route';

/**
 * INTEGRAÇÕES SÃO DE ADMIN.
 *
 * A auditoria provou o pior caso: um GUEST criou e repontou webhook — o que exfiltra o
 * fluxo de eventos do workspace inteiro. Nenhum dos handlers checava `isAdmin`.
 *
 * A metade de tokens de API deste teste saiu junto com o cofre de tokens: a credencial
 * de máquina agora é do Keycloak, e quem dá e tira é o IdP (`lib/api/public-auth.ts`).
 */

const ADMIN = 'ana@nimbloo.ai';
const GUEST = 'guest@nimbloo.ai';

let db: Db;
let hookId = '';
let deliveryId = '';

function req(url: string, email: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
   });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(async () => {
   // O alvo do webhook-fixture é loopback (nada sai da máquina); a allow-list anti-SSRF
   // bloquearia, e este teste é sobre o gate de admin, não sobre o destino.
   vi.stubEnv('CIRCLE_WEBHOOK_ALLOW_PRIVATE', 'true');
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['OPEN'] });
   const guestId = await seedUser(db, {
      name: 'Guest',
      email: GUEST,
      role: 'Guest',
      teamIds: ['OPEN'],
   });

   // Porta 9 (discard) no loopback: a entrega falha na conexão, nada trafega.
   hookId = (
      await createWebhook(
         db,
         { url: 'http://127.0.0.1:9/hook', events: ['issue.created'] },
         guestId
      )
   ).id;
   [deliveryId] = await dispatchEvent(db, 'issue.created', { id: 'i1' }, async () => {
      throw new Error('receptor indisponível');
   });
});
afterEach(() => {
   __setTestDb(null);
   vi.unstubAllEnvs();
});

describe('webhooks só para admin', () => {
   it('guest não lista, não cria, não edita, não apaga, não vê entregas e não reenvia', async () => {
      expect((await listHooksRoute(req('http://x/api/v1/webhooks', GUEST))).status).toBe(403);

      const created = await createHookRoute(
         req('http://x/api/v1/webhooks', GUEST, {
            method: 'POST',
            body: JSON.stringify({ url: 'https://evil.example.com/x', events: ['issue.created'] }),
         })
      );
      expect(created.status).toBe(403);

      // Repontar o webhook do admin para um host controlado exfiltraria todo o fluxo.
      const patched = await patchHookRoute(
         req(`http://x/api/v1/webhooks/${hookId}`, GUEST, {
            method: 'PATCH',
            body: JSON.stringify({ url: 'https://evil.example.com/x' }),
         }),
         params({ id: hookId })
      );
      expect(patched.status).toBe(403);

      const removed = await deleteHookRoute(
         req(`http://x/api/v1/webhooks/${hookId}`, GUEST, { method: 'DELETE' }),
         params({ id: hookId })
      );
      expect(removed.status).toBe(403);

      // `responseCode`/`lastError` descrevem a rede de destino — oráculo, não relatório.
      const deliveries = await deliveriesRoute(
         req(`http://x/api/v1/webhooks/${hookId}/deliveries`, GUEST),
         params({ id: hookId })
      );
      expect(deliveries.status).toBe(403);

      const again = await redeliverRoute(
         req(`http://x/api/v1/webhooks/deliveries/${deliveryId}/redeliver`, GUEST, {
            method: 'POST',
         }),
         params({ deliveryId })
      );
      expect(again.status).toBe(403);
   });

   it('admin lê a lista e as entregas', async () => {
      expect((await listHooksRoute(req('http://x/api/v1/webhooks', ADMIN))).status).toBe(200);
      const deliveries = await deliveriesRoute(
         req(`http://x/api/v1/webhooks/${hookId}/deliveries`, ADMIN),
         params({ id: hookId })
      );
      expect(deliveries.status).toBe(200);
   });
});
