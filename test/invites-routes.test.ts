import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { GET as listInvites, POST as createInvite } from '@/app/api/v1/invites/route';
import { DELETE as revokeInvite } from '@/app/api/v1/invites/[id]/route';

/**
 * Gate das rotas de convite, exercitado nos HANDLERS de verdade.
 *
 * Convite concede acesso ao Circle sem passar pelo Orbis — então quem pode criar é a
 * pergunta central. Testar só `lib/api/invites.ts` provaria a regra de negócio e deixaria
 * a autorização por conta da fé.
 */

const ADMIN = 'ana@nimbloo.ai';
const MEMBER = 'bob@nimbloo.ai';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Bob', email: MEMBER, teamIds: ['CORE'] });
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

const asUser = (email: string, body?: unknown) =>
   new Request('http://x/api/v1/invites', {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-forwarded-email': email },
      ...(body ? { body: JSON.stringify(body) } : {}),
   });

const anon = (body?: unknown) =>
   new Request('http://x/api/v1/invites', {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
   });

describe('rotas de convite: quem pode conceder acesso', () => {
   it('sem sessao: 401 em listar e criar', async () => {
      expect((await listInvites(anon())).status).toBe(401);
      expect((await createInvite(anon({ email: 'x@nimbloo.ai' }))).status).toBe(401);
   });

   it('usuario comum: 403 — nao pode conceder acesso a ninguem', async () => {
      expect((await listInvites(asUser(MEMBER))).status).toBe(403);

      const res = await createInvite(asUser(MEMBER, { email: 'novo@nimbloo.ai' }));
      expect(res.status).toBe(403);

      // E nada foi criado: o 403 nao pode ser cosmetico.
      const listed = await listInvites(asUser(ADMIN));
      expect((await listed.json()).data).toHaveLength(0);
   });

   it('admin cria, e o magic link volta UMA vez na resposta', async () => {
      const res = await createInvite(asUser(ADMIN, { email: 'Novo@Nimbloo.ai' }));
      expect(res.status).toBe(200);

      const { data } = await res.json();
      expect(data.email).toBe('novo@nimbloo.ai');
      expect(data.token).toHaveLength(64);
      expect(data.url).toContain(`/invite/${data.token}`);

      // A listagem nao reexpoe o segredo.
      const listed = await (await listInvites(asUser(ADMIN))).json();
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].token).toBeUndefined();
   });

   it('admin nao consegue convidar dominio de fora (400)', async () => {
      const res = await createInvite(asUser(ADMIN, { email: 'alguem@gmail.com' }));
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
   });

   it('payload invalido: 400', async () => {
      expect((await createInvite(asUser(ADMIN, { email: 'nao-e-email' }))).status).toBe(400);
   });

   it('revogar exige admin e some com o convite', async () => {
      const created = await (
         await createInvite(asUser(ADMIN, { email: 'novo@nimbloo.ai' }))
      ).json();
      const id = created.data.id;
      const params = { params: Promise.resolve({ id }) };

      const byMember = await revokeInvite(
         new Request(`http://x/api/v1/invites/${id}`, {
            method: 'DELETE',
            headers: { 'x-forwarded-email': MEMBER },
         }),
         params
      );
      expect(byMember.status).toBe(403);

      const byAdmin = await revokeInvite(
         new Request(`http://x/api/v1/invites/${id}`, {
            method: 'DELETE',
            headers: { 'x-forwarded-email': ADMIN },
         }),
         { params: Promise.resolve({ id }) }
      );
      expect(byAdmin.status).toBe(200);

      const listed = await (await listInvites(asUser(ADMIN))).json();
      expect(listed.data).toHaveLength(0);
   });
});
