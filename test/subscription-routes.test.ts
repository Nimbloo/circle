import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { getMe } from '@/lib/api/users';
import { GET as getSubscriptionRoute } from '@/app/api/v1/issues/[id]/subscription/route';
import { GET as getMySubscriptionsRoute } from '@/app/api/v1/me/subscriptions/route';

/**
 * O bootstrap só traz as assinaturas de issues ABERTAS (payload enxuto). Issue fechada
 * que o usuário segue continua consultável: pela issue (header) e pela lista completa
 * (aba "Subscribed" de My issues).
 */
const ME = 'ana@nimbloo.ai';
let db: Db;
let closedId = '';
let openId = '';

function req(url: string) {
   return new Request(url, { headers: { 'x-forwarded-email': ME } });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ME, teamIds: ['CORE'] });
   const closed = await createIssue(
      db,
      { teamId: 'CORE', title: 'Fechada', statusId: 'to-do', priorityId: 'low' },
      ME
   );
   await updateIssue(db, closed.id, { statusId: 'done' }, ME);
   closedId = closed.id;
   const open = await createIssue(
      db,
      { teamId: 'CORE', title: 'Aberta', statusId: 'to-do', priorityId: 'low' },
      ME
   );
   openId = open.id;
});
afterEach(() => __setTestDb(null));

describe('assinaturas fora do bootstrap', () => {
   it('o me só lista a aberta, mas a fechada continua assinada', async () => {
      const me = await getMe(db, ME);
      expect(me.subscribedIssueIds).toEqual([openId]);
      const res = await getSubscriptionRoute(
         req(`http://x/api/v1/issues/${closedId}/subscription`),
         params(closedId)
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ id: closedId, subscribed: true });
   });

   it('GET /me/subscriptions devolve todas, abertas e fechadas', async () => {
      const res = await getMySubscriptionsRoute(req('http://x/api/v1/me/subscriptions'));
      expect(res.status).toBe(200);
      expect(new Set((await res.json()).data.issueIds)).toEqual(new Set([openId, closedId]));
   });
});
