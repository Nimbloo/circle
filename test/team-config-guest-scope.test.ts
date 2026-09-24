import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { GET as getSlas } from '@/app/api/v1/teams/[teamKey]/slas/route';
import { GET as getAutomations } from '@/app/api/v1/teams/[teamKey]/automations/route';
import { GET as getTemplates } from '@/app/api/v1/teams/[teamKey]/templates/route';
import { GET as getProjectTemplates } from '@/app/api/v1/teams/[teamKey]/project-templates/route';

/**
 * Configuração do time (SLAs, automações, templates) segue o escopo do convidado (#100):
 * o time fora do escopo nem existe para ele — 403, como em GET /teams/{key}.
 */
const GUEST = 'guest@fora.com';
const MEMBER = 'member@nimbloo.ai';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'OTHER', 'Other');
   await seedUser(db, { name: 'Guest', email: GUEST, role: 'Guest', teamIds: ['OTHER'] });
   await seedUser(db, { name: 'Member', email: MEMBER, role: 'Member', teamIds: ['OTHER'] });
   __setTestDb(db);
});

const ROUTES = [
   ['slas', getSlas],
   ['automations', getAutomations],
   ['templates', getTemplates],
   ['project-templates', getProjectTemplates],
] as const;

function call(route: (typeof ROUTES)[number][1], path: string, teamKey: string, email: string) {
   return route(
      new Request(`http://x/api/v1/teams/${teamKey}/${path}`, {
         headers: { 'x-forwarded-email': email },
      }),
      { params: Promise.resolve({ teamKey }) }
   );
}

describe('GET da configuração do time respeita o escopo do convidado', () => {
   it.each(ROUTES)('%s: convidado fora do time recebe 403', async (path, route) => {
      expect((await call(route, path, 'CORE', GUEST)).status).toBe(403);
   });

   it.each(ROUTES)('%s: convidado do próprio time e membro seguem lendo', async (path, route) => {
      expect((await call(route, path, 'OTHER', GUEST)).status).toBe(200);
      expect((await call(route, path, 'CORE', MEMBER)).status).toBe(200);
   });
});
