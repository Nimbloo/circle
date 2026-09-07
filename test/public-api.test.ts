import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { appUser } from '@/db/schema';
import { createIssue } from '@/lib/api/issues';
import { setMemberDeactivated } from '@/lib/api/members';
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

/**
 * API pública autenticada pelo KEYCLOAK (SSO total): a credencial é o access token de um
 * service account do realm, não um segredo emitido pelo Circle. Os tokens abaixo são
 * assinados de verdade (RS256) contra um JWKS falso, para exercitar o caminho real —
 * assinatura, allowlist de client, papel e escopo de times.
 */
const ISS = 'https://kc.example.com/realms/nimbloo-internal';
const KID = 'test-key-1';
const OWNER = 'owner@circle.dev';
const CI_BOT = 'service-account-circle-ci@circle.local';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
   ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
   kid: KID,
   kty: 'RSA',
};

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Token de service account: `azp` é o client, e o papel vem de resource_access.circle. */
function token(opts: { client?: string; roles?: string[]; human?: boolean } = {}) {
   const client = opts.client ?? 'circle-ci';
   const payload: Record<string, unknown> = {
      iss: ISS,
      exp: Math.floor(Date.now() / 1000) + 300,
      azp: client,
      preferred_username: opts.human ? 'danilo' : `service-account-${client}`,
      ...(opts.roles ? { resource_access: { circle: { roles: opts.roles } } } : {}),
   };
   const input = `${b64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64url(payload)}`;
   const sig = cryptoSign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
   return `${input}.${sig}`;
}

function req(url: string, jwt?: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: {
         ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
         ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
   });
}

const rowOf = async (db: Db, email: string) =>
   (await db.select().from(appUser).where(eq(appUser.email, email)))[0];

let db: Db;

beforeEach(async () => {
   process.env.AUTH_KEYCLOAK_ISSUER = ISS;
   vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }))
   );
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'OPS', 'Ops');
   await seedUser(db, { name: 'Owner', email: OWNER, teamIds: ['CORE', 'OPS'] });
   __setTestDb(db);
});
afterEach(() => {
   __setTestDb(null);
   vi.unstubAllGlobals();
});

describe('quem entra na API pública', () => {
   it('401 sem token, 401 para token de pessoa, 403 sem papel no Circle', async () => {
      const anon = await listPublicIssues(req('http://x/api/public/v1/issues'));
      expect(anon.status).toBe(401);
      expect(anon.headers.get('content-type')).toContain('application/problem+json');

      // Token de PESSOA do realm (o do Grafana carrega as roles do Circle, porque aquele
      // client emite com escopo completo): assinado e válido, mas não entra na porta de
      // máquina. Gente entra pela sessão.
      const human = await listPublicIssues(
         req(
            'http://x/api/public/v1/issues',
            token({ client: 'grafana', roles: ['admin'], human: true })
         )
      );
      expect(human.status).toBe(401);

      // Client liberado, mas sem client role de `circle`: 403, não 200.
      const roleless = await listPublicIssues(req('http://x/api/public/v1/issues', token()));
      expect(roleless.status).toBe(403);
   });

   it('provisiona o service account e sincroniza o papel a cada chamada', async () => {
      await listPublicIssues(req('http://x/api/public/v1/issues', token({ roles: ['member'] })));
      expect((await rowOf(db, CI_BOT)).role).toBe('Member');

      // Promover no Keycloak vale na chamada seguinte, sem deploy.
      await listPublicIssues(req('http://x/api/public/v1/issues', token({ roles: ['admin'] })));
      expect((await rowOf(db, CI_BOT)).role).toBe('Admin');

      // E rebaixar também.
      await listPublicIssues(req('http://x/api/public/v1/issues', token({ roles: ['guest'] })));
      expect((await rowOf(db, CI_BOT)).role).toBe('Guest');
   });

   it('desativar a conta no Circle corta o acesso mesmo com token válido', async () => {
      await listPublicIssues(req('http://x/api/public/v1/issues', token({ roles: ['member'] })));
      await setMemberDeactivated(db, (await rowOf(db, CI_BOT)).id, true);

      const res = await listPublicIssues(
         req('http://x/api/public/v1/issues', token({ roles: ['member'] }))
      );
      expect(res.status).toBe(403);
   });
});

describe('rotas /api/public/v1', () => {
   it('lista, cria, lê e atualiza issues com um service account Member', async () => {
      const jwt = token({ roles: ['member'] });

      const created = await createPublicIssue(
         req('http://x/api/public/v1/issues', jwt, {
            method: 'POST',
            body: JSON.stringify({ teamId: 'CORE', title: 'Via API', priorityId: 'high' }),
         })
      );
      expect(created.status).toBe(200);
      const issue = (await created.json()).data;
      expect(issue.identifier).toBe('CORE-1');
      expect(issue.createdBy.email).toBe(CI_BOT);

      const listed = await listPublicIssues(req('http://x/api/public/v1/issues', jwt));
      expect((await listed.json()).data).toHaveLength(1);

      const detail = await getPublicIssue(req('http://x/api/public/v1/issues/CORE-1', jwt), {
         params: Promise.resolve({ id: 'CORE-1' }),
      });
      expect((await detail.json()).data.id).toBe(issue.id);

      const patched = await patchPublicIssue(
         req(`http://x/api/public/v1/issues/${issue.id}`, jwt, {
            method: 'PATCH',
            body: JSON.stringify({ title: 'Renomeada' }),
         }),
         { params: Promise.resolve({ id: issue.id }) }
      );
      expect((await patched.json()).data.title).toBe('Renomeada');
   });

   it('service account Guest fica preso aos times dele, na leitura e na escrita', async () => {
      await seedUser(db, {
         name: 'Bot convidado',
         email: 'service-account-circle-guest@circle.local',
         role: 'Guest',
         teamIds: ['CORE'],
      });
      await createIssue(db, { teamId: 'CORE', title: 'Do guest', priorityId: 'high' }, OWNER);
      await createIssue(db, { teamId: 'OPS', title: 'Fora', priorityId: 'high' }, OWNER);

      const jwt = token({ client: 'circle-guest', roles: ['guest'] });
      const listed = await listPublicIssues(req('http://x/api/public/v1/issues', jwt));
      const titles = (await listed.json()).data.map((i: { title: string }) => i.title);
      expect(titles).toEqual(['Do guest']);

      const teams = await listPublicTeams(req('http://x/api/public/v1/teams', jwt));
      expect((await teams.json()).data.map((t: { id: string }) => t.id)).toEqual(['CORE']);

      const denied = await createPublicIssue(
         req('http://x/api/public/v1/issues', jwt, {
            method: 'POST',
            body: JSON.stringify({ teamId: 'OPS', title: 'Não pode' }),
         })
      );
      expect(denied.status).toBe(403);
   });

   it('openapi.json exige credencial e descreve um esquema só, sem escopos', async () => {
      expect((await openapi(req('http://x/api/public/v1/openapi.json'))).status).toBe(401);

      const res = await openapi(
         req('http://x/api/public/v1/openapi.json', token({ roles: ['member'] }))
      );
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
      expect(doc.components.securitySchemes.bearerAuth.bearerFormat).toBe('JWT');
      expect(doc.paths['/issues'].post.security).toEqual([{ bearerAuth: [] }]);
   });
});
