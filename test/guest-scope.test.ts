import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createIssue } from '@/lib/api/issues';
import { createProject } from '@/lib/api/projects';
import { createInitiative } from '@/lib/api/initiatives';
import { createView } from '@/lib/api/views';
import { updateTeam } from '@/lib/api/teams';
import { createInvite } from '@/lib/api/invites';
import { decideKeycloakLogin } from '@/lib/api/login-gate';
import { getMember } from '@/lib/api/members';
import { getOrCreateUser } from '@/lib/api/users';

import { GET as getWorkspace } from '@/app/api/v1/workspace/route';
import { GET as listIssuesRoute } from '@/app/api/v1/issues/route';
import { GET as getIssueRoute } from '@/app/api/v1/issues/[id]/route';
import { GET as getIssueDetailRoute } from '@/app/api/v1/issues/[id]/detail/route';
import { GET as listProjectsRoute } from '@/app/api/v1/projects/route';
import { GET as getProjectRoute } from '@/app/api/v1/projects/[id]/route';
import { GET as getProjectDetailRoute } from '@/app/api/v1/projects/[id]/detail/route';
import { GET as listProjectIssuesRoute } from '@/app/api/v1/projects/[id]/issues/route';
import { GET as listInitiativesRoute } from '@/app/api/v1/initiatives/route';
import { GET as getInitiativeRoute } from '@/app/api/v1/initiatives/[id]/route';
import { GET as listViewsRoute } from '@/app/api/v1/views/route';
import { GET as viewResultsRoute } from '@/app/api/v1/views/[id]/results/route';
import { GET as listMembersRoute } from '@/app/api/v1/members/route';
import { GET as listTeamsRoute } from '@/app/api/v1/teams/route';
import { GET as getTeamRoute } from '@/app/api/v1/teams/[teamKey]/route';
import { GET as listTeamIssuesRoute } from '@/app/api/v1/teams/[teamKey]/issues/route';

/**
 * TESTE DE AUTORIZAÇÃO POR ROTA (#100).
 *
 * O guest é membro de OPEN (e do sub-time SUB); SECRET é de outro time. Cada rota de
 * leitura tem que devolver 403 (recurso identificado) ou lista sem o que é do SECRET
 * — nunca vazar título, id ou contagem. Uma rota nova que esqueça o escopo cai aqui.
 */

const ADMIN = 'ana@nimbloo.ai';
const GUEST = 'guest@nimbloo.ai';

let db: Db;
const ids = {
   openIssue: '',
   secretIssue: '',
   subIssue: '',
   openProject: '',
   secretProject: '',
   openInitiative: '',
   secretInitiative: '',
   openView: '',
   secretView: '',
   memberOnlyId: '',
};

function req(url: string, email: string) {
   return new Request(url, { headers: { 'x-forwarded-email': email } });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (res: Response) => (await res.json()).data;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);

   await seedTeam(db, 'OPEN', 'Open');
   await seedTeam(db, 'SUB', 'Sub');
   await seedTeam(db, 'SECRET', 'Secret');
   await updateTeam(db, 'SUB', { parentId: 'OPEN' });

   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['OPEN', 'SECRET'] });
   await seedUser(db, { name: 'Guest', email: GUEST, role: 'Guest', teamIds: ['OPEN'] });
   ids.memberOnlyId = await seedUser(db, {
      name: 'Bruno',
      email: 'bruno@nimbloo.ai',
      teamIds: ['SECRET'],
   });

   const issueBase = { statusId: 'to-do', priorityId: 'high' };
   ids.openIssue = (
      await createIssue(db, { ...issueBase, teamId: 'OPEN', title: 'aberta' }, ADMIN)
   ).id;
   ids.subIssue = (await createIssue(db, { ...issueBase, teamId: 'SUB', title: 'sub' }, ADMIN)).id;
   ids.secretIssue = (
      await createIssue(db, { ...issueBase, teamId: 'SECRET', title: 'secreta' }, ADMIN)
   ).id;

   const projectBase = {
      statusId: 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
   };
   ids.openProject = (
      await createProject(db, { ...projectBase, name: 'P open', teamId: 'OPEN' })
   ).id;
   ids.secretProject = (
      await createProject(db, { ...projectBase, name: 'P secret', teamId: 'SECRET' })
   ).id;

   ids.openInitiative = (
      await createInitiative(db, {
         slug: 'open',
         name: 'Open initiative',
         priorityId: 'high',
         healthId: 'on-track',
         projectIds: [ids.openProject],
      })
   ).id;
   ids.secretInitiative = (
      await createInitiative(db, {
         slug: 'secret',
         name: 'Secret initiative',
         priorityId: 'high',
         healthId: 'on-track',
         projectIds: [ids.secretProject],
      })
   ).id;

   ids.openView = (
      await createView(
         db,
         { slug: 'open-view', name: 'Open view', type: 'issue', filter: {}, teamId: 'OPEN' },
         ADMIN
      )
   ).id;
   ids.secretView = (
      await createView(
         db,
         { slug: 'secret-view', name: 'Secret view', type: 'issue', filter: {}, teamId: 'SECRET' },
         ADMIN
      )
   ).id;
});
afterEach(() => __setTestDb(null));

describe('escopo de Guest por rota de leitura (#100)', () => {
   it('workspace: só os times do guest (com sub-times), sem projetos/views/membros de fora', async () => {
      const data = await json(await getWorkspace(req('http://x/api/v1/workspace', GUEST)));
      expect(data.teams.map((t: { id: string }) => t.id).sort()).toEqual(['OPEN', 'SUB']);
      expect(data.projects.map((p: { name: string }) => p.name)).toEqual(['P open']);
      expect(data.initiatives.map((i: { name: string }) => i.name)).toEqual(['Open initiative']);
      expect(data.views.map((v: { name: string }) => v.name)).toEqual(['Open view']);
      expect(data.members.map((m: { email: string }) => m.email)).not.toContain('bruno@nimbloo.ai');

      // O admin continua vendo tudo — o escopo é do papel, não uma regressão global.
      const asAdmin = await json(await getWorkspace(req('http://x/api/v1/workspace', ADMIN)));
      expect(asAdmin.teams).toHaveLength(3);
   });

   it('GET /issues: lista só as issues dos times visíveis (inclui o sub-time)', async () => {
      const data = await json(await listIssuesRoute(req('http://x/api/v1/issues', GUEST)));
      expect(data.map((i: { title: string }) => i.title).sort()).toEqual(['aberta', 'sub']);
   });

   it('GET /issues?team=SECRET não vaza mesmo com o filtro forçado na query', async () => {
      const data = await json(
         await listIssuesRoute(req('http://x/api/v1/issues?team=SECRET', GUEST))
      );
      expect(data).toEqual([]);
   });

   it('GET /issues/{id} e /detail: 403 fora do escopo, 200 dentro', async () => {
      const url = (id: string) => `http://x/api/v1/issues/${id}`;
      expect(
         (await getIssueRoute(req(url(ids.secretIssue), GUEST), params({ id: ids.secretIssue })))
            .status
      ).toBe(403);
      expect(
         (
            await getIssueDetailRoute(
               req(`${url(ids.secretIssue)}/detail`, GUEST),
               params({ id: ids.secretIssue })
            )
         ).status
      ).toBe(403);

      expect(
         (await getIssueRoute(req(url(ids.openIssue), GUEST), params({ id: ids.openIssue }))).status
      ).toBe(200);
   });

   it('GET /projects e /projects/{id}: lista escopada e 403 fora', async () => {
      const list = await json(await listProjectsRoute(req('http://x/api/v1/projects', GUEST)));
      expect(list.map((p: { name: string }) => p.name)).toEqual(['P open']);

      const url = (id: string) => `http://x/api/v1/projects/${id}`;
      expect(
         (
            await getProjectRoute(
               req(url(ids.secretProject), GUEST),
               params({ id: ids.secretProject })
            )
         ).status
      ).toBe(403);
      expect(
         (
            await getProjectDetailRoute(
               req(`${url(ids.secretProject)}/detail`, GUEST),
               params({ id: ids.secretProject })
            )
         ).status
      ).toBe(403);
      expect(
         (
            await listProjectIssuesRoute(
               req(`${url(ids.secretProject)}/issues`, GUEST),
               params({ id: ids.secretProject })
            )
         ).status
      ).toBe(403);
      expect(
         (await getProjectRoute(req(url(ids.openProject), GUEST), params({ id: ids.openProject })))
            .status
      ).toBe(200);
   });

   it('GET /initiatives e /initiatives/{id}: só as com projeto num time visível', async () => {
      const list = await json(
         await listInitiativesRoute(req('http://x/api/v1/initiatives', GUEST))
      );
      expect(list.map((i: { name: string }) => i.name)).toEqual(['Open initiative']);
      expect(
         (
            await getInitiativeRoute(
               req(`http://x/api/v1/initiatives/${ids.secretInitiative}`, GUEST),
               params({ id: ids.secretInitiative })
            )
         ).status
      ).toBe(403);
      expect(
         (
            await getInitiativeRoute(
               req(`http://x/api/v1/initiatives/${ids.openInitiative}`, GUEST),
               params({ id: ids.openInitiative })
            )
         ).status
      ).toBe(200);
   });

   it('GET /views e /views/{id}/results: view de time fora do escopo some e não resolve', async () => {
      const list = await json(await listViewsRoute(req('http://x/api/v1/views', GUEST)));
      expect(list.map((v: { name: string }) => v.name)).toEqual(['Open view']);

      const secret = await viewResultsRoute(
         req(`http://x/api/v1/views/${ids.secretView}/results`, GUEST),
         params({ id: ids.secretView })
      );
      expect(secret.status).toBe(404);

      const open = await viewResultsRoute(
         req(`http://x/api/v1/views/${ids.openView}/results`, GUEST),
         params({ id: ids.openView })
      );
      expect(open.status).toBe(200);
      const issues = (await open.json()).data.issues as { title: string }[];
      expect(issues.map((i) => i.title).sort()).toEqual(['aberta', 'sub']);
   });

   it('GET /members: só quem compartilha um time visível', async () => {
      const data = await json(await listMembersRoute(req('http://x/api/v1/members', GUEST)));
      const emails = data.map((m: { email: string }) => m.email);
      expect(emails).toContain(GUEST);
      expect(emails).not.toContain('bruno@nimbloo.ai');
   });

   it('GET /teams e /teams/{key}: lista escopada e 403 no time de fora', async () => {
      const list = await json(await listTeamsRoute(req('http://x/api/v1/teams', GUEST)));
      expect(list.map((t: { id: string }) => t.id).sort()).toEqual(['OPEN', 'SUB']);

      expect(
         (
            await getTeamRoute(
               req('http://x/api/v1/teams/SECRET', GUEST),
               params({ teamKey: 'SECRET' })
            )
         ).status
      ).toBe(403);
      expect(
         (
            await listTeamIssuesRoute(
               req('http://x/api/v1/teams/SECRET/issues', GUEST),
               params({ teamKey: 'SECRET' })
            )
         ).status
      ).toBe(403);
      expect(
         (await getTeamRoute(req('http://x/api/v1/teams/SUB', GUEST), params({ teamKey: 'SUB' })))
            .status
      ).toBe(200);
   });

   it('convite com papel Guest provisiona o usuário como convidado no 1º login', async () => {
      const email = 'convidado@nimbloo.ai';
      const dto = await createInvite(db, email, ADMIN, 'Guest');
      expect(dto.role).toBe('Guest');

      const decision = await decideKeycloakLogin(
         db,
         { email, email_verified: true, groups: [] },
         email
      );
      expect(decision).toEqual({ allowed: true, via: 'invite', role: 'Guest' });

      // É o `signIn` que provisiona com o papel do convite; o efeito é este.
      const user = await getOrCreateUser(db, email, decision.allowed ? 'Guest' : 'Member');
      expect((await getMember(db, user.id))!.role).toBe('Guest');
   });

   it('convite recusa papel não convidável (Admin não sai por link)', async () => {
      await expect(createInvite(db, 'chefe@nimbloo.ai', ADMIN, 'Admin')).rejects.toMatchObject({
         status: 400,
      });
   });

   it('guest sem time nenhum não enxerga nada (escopo vazio ≠ escopo ausente)', async () => {
      await seedUser(db, { name: 'Solo', email: 'solo@nimbloo.ai', role: 'Guest' });
      const data = await json(
         await getWorkspace(req('http://x/api/v1/workspace', 'solo@nimbloo.ai'))
      );
      expect(data.teams).toEqual([]);
      expect(data.projects).toEqual([]);
      expect(data.initiatives).toEqual([]);
      expect(
         await json(await listIssuesRoute(req('http://x/api/v1/issues', 'solo@nimbloo.ai')))
      ).toEqual([]);
   });
});
