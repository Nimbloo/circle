import { afterEach, describe, expect, it } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb } from '@/db';
import { PATCH as patchMemberRoute } from '@/app/api/v1/members/[id]/route';
import { getMember } from '@/lib/api/members';

/**
 * #52 (decisão do usuário): o papel vem do Keycloak/Orbis e é re-sincronizado a cada
 * login — editar no Circle era desfeito no acesso seguinte. A UI mostra o papel só
 * para leitura, com a dica de onde alterar, e a rota recusa a troca explicando a fonte.
 */

const ADMIN = 'ana@nimbloo.ai';

describe('papel somente leitura (#52)', () => {
   afterEach(() => __setTestDb(null));

   it('PATCH role responde 409 explicando que o papel vem do Keycloak', async () => {
      const db = await makeTestDb();
      __setTestDb(db);
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
      const bobId = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
      const res = await patchMemberRoute(
         new Request('http://x/api/v1/members/' + bobId, {
            method: 'PATCH',
            headers: { 'x-forwarded-email': ADMIN, 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'Admin' }),
         }),
         { params: Promise.resolve({ id: bobId }) }
      );
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).toMatch(/Keycloak/);
      expect((await getMember(db, bobId))?.role).toBe('Member');
   });
});
