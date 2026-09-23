import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { PATCH as patchMeRoute } from '@/app/api/v1/me/route';
import { POST as createAutomationRoute } from '@/app/api/v1/teams/[teamKey]/automations/route';
import { PATCH as patchAutomationRoute } from '@/app/api/v1/teams/[teamKey]/automations/[id]/route';

/**
 * Nome só com espaços passava nas rotas de automação e de perfil (as demais já faziam
 * `trim().min(1)`): a automação ou o usuário ficavam com nome em branco.
 */
const ADMIN = 'ana@nimbloo.ai';
let db: Db;

function req(url: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: { 'x-forwarded-email': ADMIN, 'content-type': 'application/json' },
   });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const automation = (name: string) =>
   JSON.stringify({
      name,
      trigger: 'issue.created_in_triage',
      action: 'set_priority',
      config: { priorityId: 'high' },
   });

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['OPEN'] });
});
afterEach(() => __setTestDb(null));

describe('nomes com trim nas rotas de automação e de perfil', () => {
   it('automação: nome em branco é 400 e espaços nas pontas somem (criar e editar)', async () => {
      const url = 'http://x/api/v1/teams/OPEN/automations';
      const blank = await createAutomationRoute(
         req(url, { method: 'POST', body: automation('   ') }),
         params({ teamKey: 'OPEN' })
      );
      expect(blank.status).toBe(400);

      const created = await createAutomationRoute(
         req(url, { method: 'POST', body: automation('  Prioriza  ') }),
         params({ teamKey: 'OPEN' })
      );
      expect(created.status).toBe(200);
      const dto = (await created.json()).data;
      expect(dto.name).toBe('Prioriza');

      const patched = await patchAutomationRoute(
         req(`${url}/${dto.id}`, { method: 'PATCH', body: JSON.stringify({ name: ' ' }) }),
         params({ teamKey: 'OPEN', id: dto.id })
      );
      expect(patched.status).toBe(400);
   });

   it('perfil: nome em branco é 400 e espaços nas pontas somem', async () => {
      const blank = await patchMeRoute(
         req('http://x/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name: '  ' }) })
      );
      expect(blank.status).toBe(400);

      const ok = await patchMeRoute(
         req('http://x/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name: '  Ana  ' }) })
      );
      expect(ok.status).toBe(200);
      expect((await ok.json()).data.name).toBe('Ana');
   });
});
