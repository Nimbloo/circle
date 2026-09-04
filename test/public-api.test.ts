import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import {
   authenticateApiToken,
   createApiToken,
   listApiTokens,
   revokeApiToken,
} from '@/lib/api/api-tokens';
import { createIssue } from '@/lib/api/issues';
import {
   GET as listPublicIssues,
   POST as createPublicIssue,
} from '@/app/api/public/v1/issues/route';
import {
   GET as getPublicIssue,
   PATCH as patchPublicIssue,
} from '@/app/api/public/v1/issues/[id]/route';
import { GET as listPublicTeams } from '@/app/api/public/v1/teams/route';
import { GET as openapi } from '@/app/api/public/v1/openapi.json/route';

const OWNER = 'owner@circle.dev';
const GUEST = 'guest@circle.dev';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'OPS', 'Ops');
   await seedUser(db, { name: 'Owner', email: OWNER, teamIds: ['CORE', 'OPS'] });
   await seedUser(db, { name: 'Guest', email: GUEST, role: 'Guest', teamIds: ['CORE'] });
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

function req(url: string, token?: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: {
         ...(token ? { authorization: `Bearer ${token}` } : {}),
         ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
   });
}

async function tokenFor(email: string, scopes: ('read' | 'write')[] = ['read']) {
   return (await createApiToken(db, { name: `t-${scopes.join('-')}`, scopes }, email)).token;
}

describe('tokens da API pública (#101)', () => {
   it('mostra o token em claro uma única vez e guarda só o hash', async () => {
      const created = await createApiToken(db, { name: 'CI', scopes: ['read', 'write'] }, OWNER);
      expect(created.token).toMatch(/^circle_[0-9a-f]{64}$/);
      expect(created.prefix).toBe(created.token.slice(0, 13));

      const listed = await listApiTokens(db);
      expect(listed).toHaveLength(1);
      expect(JSON.stringify(listed)).not.toContain(created.token);
      expect(listed[0].scopes.sort()).toEqual(['read', 'write']);
      expect(listed[0].lastUsedAt).toBeNull();
   });

   it('autentica o token, marca last_used_at e recusa depois de revogar', async () => {
      const created = await createApiToken(db, { name: 'CI', scopes: ['read'] }, OWNER);
      const auth = await authenticateApiToken(db, created.token);
      expect(auth?.user.email).toBe(OWNER);
      expect((await listApiTokens(db))[0].lastUsedAt).not.toBeNull();

      expect(await authenticateApiToken(db, 'circle_deadbeef')).toBeNull();
      expect(await authenticateApiToken(db, 'não-é-token')).toBeNull();

      expect(await revokeApiToken(db, created.id)).toBe(true);
      expect(await authenticateApiToken(db, created.token)).toBeNull();
      expect((await listApiTokens(db))[0].revokedAt).not.toBeNull();
   });
});

describe('rotas /api/public/v1 (#101)', () => {
   it('401 sem token e 403 sem o escopo', async () => {
      const anon = await listPublicIssues(req('http://x/api/public/v1/issues'));
      expect(anon.status).toBe(401);
      expect(anon.headers.get('content-type')).toContain('application/problem+json');

      const readOnly = await tokenFor(OWNER, ['read']);
      const forbidden = await createPublicIssue(
         req('http://x/api/public/v1/issues', readOnly, {
            method: 'POST',
            body: JSON.stringify({ teamId: 'CORE', title: 'X' }),
         })
      );
      expect(forbidden.status).toBe(403);
   });

   it('lista, cria e atualiza issues com o escopo certo', async () => {
      const token = await tokenFor(OWNER, ['read', 'write']);

      const created = await createPublicIssue(
         req('http://x/api/public/v1/issues', token, {
            method: 'POST',
            body: JSON.stringify({ teamId: 'CORE', title: 'Via API', priorityId: 'high' }),
         })
      );
      expect(created.status).toBe(200);
      const issue = (await created.json()).data;
      expect(issue.identifier).toBe('CORE-1');
      expect(issue.createdBy.email).toBe(OWNER);

      const listed = await listPublicIssues(req('http://x/api/public/v1/issues', token));
      expect((await listed.json()).data).toHaveLength(1);

      const detail = await getPublicIssue(
         req(`http://x/api/public/v1/issues/${issue.identifier}`, token),
         { params: Promise.resolve({ id: issue.identifier }) }
      );
      expect((await detail.json()).data.id).toBe(issue.id);

      const patched = await patchPublicIssue(
         req(`http://x/api/public/v1/issues/${issue.id}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ title: 'Renomeada' }),
         }),
         { params: Promise.resolve({ id: issue.id }) }
      );
      expect((await patched.json()).data.title).toBe('Renomeada');
   });

   it('token de convidado só enxerga os times dele', async () => {
      await createIssue(db, { teamId: 'CORE', title: 'Do guest', priorityId: 'high' }, OWNER);
      await createIssue(db, { teamId: 'OPS', title: 'Fora', priorityId: 'high' }, OWNER);

      const guestToken = await tokenFor(GUEST, ['read', 'write']);
      const listed = await listPublicIssues(req('http://x/api/public/v1/issues', guestToken));
      const titles = (await listed.json()).data.map((i: { title: string }) => i.title);
      expect(titles).toEqual(['Do guest']);

      const teams = await listPublicTeams(req('http://x/api/public/v1/teams', guestToken));
      expect((await teams.json()).data.map((t: { id: string }) => t.id)).toEqual(['CORE']);

      // Criar fora do escopo é 403, não 200 silencioso.
      const denied = await createPublicIssue(
         req('http://x/api/public/v1/issues', guestToken, {
            method: 'POST',
            body: JSON.stringify({ teamId: 'OPS', title: 'Não pode' }),
         })
      );
      expect(denied.status).toBe(403);
   });

   it('openapi.json descreve os recursos e o esquema de segurança', async () => {
      const token = await tokenFor(OWNER, ['read']);
      const res = await openapi(req('http://x/api/public/v1/openapi.json', token));
      expect(res.status).toBe(200);
      const doc = await res.json();
      expect(doc.openapi).toBe('3.1.0');
      expect(Object.keys(doc.paths).sort()).toEqual([
         '/issues',
         '/issues/{id}',
         '/labels',
         '/projects',
         '/projects/{id}',
         '/statuses',
         '/teams',
      ]);
      expect(doc.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
      expect(doc.paths['/issues'].post.security).toEqual([{ bearerAuth: ['write'] }]);
   });
});
