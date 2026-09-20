import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { PATCH as patchMeRoute } from '@/app/api/v1/me/route';

/**
 * O `app_user` fica em cache durante a request (#40). Escrita no próprio usuário
 * precisa invalidar esse cache: senão a resposta do PATCH é montada com a linha
 * anterior e a UI aplica o valor velho.
 */
const ME = 'ana@nimbloo.ai';
let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedUser(db, { name: 'Ana', email: ME, role: 'Member', teamIds: ['OPEN'] });
});
afterEach(() => __setTestDb(null));

describe('cache de usuário por request', () => {
   it('PATCH /me responde com o perfil já atualizado', async () => {
      const res = await patchMeRoute(
         new Request('http://x/api/v1/me', {
            method: 'PATCH',
            headers: { 'x-forwarded-email': ME, 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Ana Souza' }),
         })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.name).toBe('Ana Souza');
   });
});
