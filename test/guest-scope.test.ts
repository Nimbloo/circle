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
import { GET as getViewRoute } from '@/app/api/v1/views/[id]/route';
import { GET as teamDocumentsRoute } from '@/app/api/v1/teams/[teamKey]/documents/route';
import { GET as teamMembersRoute } from '@/app/api/v1/teams/[teamKey]/members/route';
import { GET as teamCyclesRoute } from '@/app/api/v1/teams/[teamKey]/cycles/route';
import { GET as favoritesRoute } from '@/app/api/v1/favorites/route';
import { GET as searchRoute } from '@/app/api/v1/search/route';
import { GET as teamTriageRoute } from '@/app/api/v1/teams/[teamKey]/triage-suggestions/route';
import { GET as listMembersRoute } from '@/app/api/v1/members/route';
import { GET as listTeamsRoute } from '@/app/api/v1/teams/route';
import { GET as getTeamRoute } from '@/app/api/v1/teams/[teamKey]/route';
import { GET as listTeamIssuesRoute } from '@/app/api/v1/teams/[teamKey]/issues/route';

// Rotas de ESCRITA (o gate novo) + as leituras que faltavam escopo.
import { POST as createIssueRoute } from '@/app/api/v1/issues/route';
import {
   PATCH as patchIssueRoute,
   DELETE as deleteIssueRoute,
} from '@/app/api/v1/issues/[id]/route';
import { PATCH as patchIssueDetailRoute } from '@/app/api/v1/issues/[id]/detail/route';
import { GET as issueActivityRoute } from '@/app/api/v1/issues/[id]/activity/route';
import { GET as issueAttachmentsRoute } from '@/app/api/v1/issues/[id]/attachments/route';
import { POST as addCommentRoute } from '@/app/api/v1/issues/[id]/comments/route';
import { POST as addLabelRoute } from '@/app/api/v1/issues/[id]/labels/route';
import { DELETE as removeLabelRoute } from '@/app/api/v1/issues/[id]/labels/[labelId]/route';
import { PATCH as rankRoute } from '@/app/api/v1/issues/[id]/rank/route';
import {
   POST as addRelationRoute,
   DELETE as removeRelationRoute,
} from '@/app/api/v1/issues/[id]/relations/route';
import {
   POST as subscribeRoute,
   DELETE as unsubscribeRoute,
} from '@/app/api/v1/issues/[id]/subscription/route';
import { GET as triageSuggestionRoute } from '@/app/api/v1/issues/[id]/triage-suggestion/route';
import { POST as triageAcceptRoute } from '@/app/api/v1/issues/[id]/triage-suggestion/accept/route';
import { POST as triageDismissRoute } from '@/app/api/v1/issues/[id]/triage-suggestion/dismiss/route';
import { GET as exportIssuesRoute } from '@/app/api/v1/issues/export/route';
import { GET as aggregateRoute } from '@/app/api/v1/issues/aggregate/route';
import { POST as createProjectRoute } from '@/app/api/v1/projects/route';
import {
   PATCH as patchProjectRoute,
   DELETE as deleteProjectRoute,
} from '@/app/api/v1/projects/[id]/route';
import { PATCH as patchProjectDetailRoute } from '@/app/api/v1/projects/[id]/detail/route';
import { GET as projectProgressRoute } from '@/app/api/v1/projects/[id]/progress/route';
import {
   GET as listMilestonesRoute,
   POST as addMilestoneRoute,
} from '@/app/api/v1/projects/[id]/milestones/route';
import {
   PATCH as patchMilestoneRoute,
   DELETE as deleteMilestoneRoute,
} from '@/app/api/v1/projects/[id]/milestones/[mid]/route';
import {
   GET as listResourcesRoute,
   POST as addResourceRoute,
} from '@/app/api/v1/projects/[id]/resources/route';
import {
   PATCH as patchResourceRoute,
   DELETE as deleteResourceRoute,
} from '@/app/api/v1/projects/[id]/resources/[rid]/route';
import {
   GET as listProjectUpdatesRoute,
   POST as postProjectUpdateRoute,
} from '@/app/api/v1/projects/[id]/updates/route';
import { PUT as putDependenciesRoute } from '@/app/api/v1/projects/[id]/dependencies/route';
import { POST as createViewRoute } from '@/app/api/v1/views/route';
import { POST as importCommitRoute } from '@/app/api/v1/import/commit/route';
import { POST as createInitiativeRoute } from '@/app/api/v1/initiatives/route';
import {
   PATCH as patchInitiativeRoute,
   DELETE as deleteInitiativeRoute,
} from '@/app/api/v1/initiatives/[id]/route';
import { GET as initiativeActivityRoute } from '@/app/api/v1/initiatives/[id]/activity/route';
import { POST as postInitiativeUpdateRoute } from '@/app/api/v1/initiatives/[id]/updates/route';
import { addMilestone, addResource } from '@/lib/api/project-detail';
import { deleteIssue } from '@/lib/api/issues';
import { commitImport } from '@/lib/api/import';

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
   openMilestone: '',
   secretMilestone: '',
   openResource: '',
   secretResource: '',
};

function req(url: string, email: string) {
   return new Request(url, { headers: { 'x-forwarded-email': email } });
}
/** Request de ESCRITA (com corpo JSON quando houver). */
function wreq(url: string, email: string, method: string, body?: unknown) {
   return new Request(url, {
      method,
      headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
   });
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

   ids.openMilestone = (await addMilestone(db, ids.openProject, { name: 'M open' })).id;
   ids.secretMilestone = (await addMilestone(db, ids.secretProject, { name: 'M secret' })).id;
   ids.openResource = (
      await addResource(db, ids.openProject, { label: 'R open', url: 'https://open.example' })
   ).id;
   ids.secretResource = (
      await addResource(db, ids.secretProject, { label: 'R secret', url: 'https://secret.example' })
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

/**
 * ESCOPO DE ESCRITA (hardening).
 *
 * A auditoria da v0.29.0 provou, rodando código, que TODA escrita respondia 200 para um
 * guest de outro time: criar issue no time alheio (inclusive herdando o time pelo pai),
 * editar/apagar issue e projeto, comentar, ler o feed, mexer em milestone/resource por id
 * global, e — a escalação que anula tudo — MOVER um recurso alheio para o próprio time.
 * Cada caso abaixo falhava (200) antes do gate na camada de serviço.
 */
describe('escopo de Guest nas rotas de ESCRITA', () => {
   const status = (r: Response) => r.status;

   it('POST /issues: 403 no time alheio, inclusive herdando o time pelo parentId', async () => {
      const base = { title: 'invasão', statusId: 'to-do', priorityId: 'high' };
      expect(
         status(
            await createIssueRoute(
               wreq('http://x/api/v1/issues', GUEST, 'POST', { ...base, teamId: 'SECRET' })
            )
         )
      ).toBe(403);

      // Sem teamId no corpo o time vem do PAI (#95): validar só o corpo deixa o bypass.
      expect(
         status(
            await createIssueRoute(
               wreq('http://x/api/v1/issues', GUEST, 'POST', {
                  title: 'filha invasora',
                  parentId: ids.secretIssue,
               })
            )
         )
      ).toBe(403);

      // No próprio time continua funcionando.
      expect(
         status(
            await createIssueRoute(
               wreq('http://x/api/v1/issues', GUEST, 'POST', { ...base, teamId: 'OPEN' })
            )
         )
      ).toBe(200);
   });

   it('PATCH/DELETE /issues/{id}: 403 na issue de outro time', async () => {
      const p = params({ id: ids.secretIssue });
      const url = `http://x/api/v1/issues/${ids.secretIssue}`;
      expect(status(await patchIssueRoute(wreq(url, GUEST, 'PATCH', { title: 'hack' }), p))).toBe(
         403
      );
      expect(status(await deleteIssueRoute(wreq(url, GUEST, 'DELETE'), p))).toBe(403);
      expect(
         status(
            await patchIssueDetailRoute(
               wreq(`${url}/detail`, GUEST, 'PATCH', { description: 'hack' }),
               p
            )
         )
      ).toBe(403);
   });

   it('PATCH /issues/{id}: 403 ao mover a issue para projeto ou pai de outro time', async () => {
      const p = params({ id: ids.openIssue });
      const url = `http://x/api/v1/issues/${ids.openIssue}`;
      expect(
         status(
            await patchIssueRoute(wreq(url, GUEST, 'PATCH', { projectId: ids.secretProject }), p)
         )
      ).toBe(403);
      expect(
         status(await patchIssueRoute(wreq(url, GUEST, 'PATCH', { parentId: ids.secretIssue }), p))
      ).toBe(403);
   });

   it('comentário e feed de issue alheia: 403 (o feed vazava o corpo dos comentários)', async () => {
      const p = params({ id: ids.secretIssue });
      const url = `http://x/api/v1/issues/${ids.secretIssue}`;
      expect(
         status(await addCommentRoute(wreq(`${url}/comments`, GUEST, 'POST', { body: 'oi' }), p))
      ).toBe(403);
      expect(status(await issueActivityRoute(req(`${url}/activity`, GUEST), p))).toBe(403);
      expect(status(await issueAttachmentsRoute(req(`${url}/attachments`, GUEST), p))).toBe(403);
   });

   it('busca não devolve nada de time fora do escopo, nem com ?teamId= dirigido', async () => {
      // ERA O ACHADO PRINCIPAL DA AUDITORIA e passou batido em três levas: a rota só
      // chamava `requireEmail`, então o convidado lia título e snippet do workspace todo.
      const body = async (r: Response) => {
         const json = await r.json();
         if (!json.data) throw new Error(`busca falhou: ${r.status} ${JSON.stringify(json)}`);
         return json.data;
      };
      const livre = await body(await searchRoute(req('http://x/api/v1/search?q=secret', GUEST)));
      const ids = livre.groups.flatMap((g: { items: { id: string }[] }) =>
         g.items.map((i) => i.id)
      );
      expect(ids).not.toContain(ids.secretIssue);
      expect(ids).not.toContain(ids.secretProject);

      const dirigido = await body(
         await searchRoute(req('http://x/api/v1/search?q=secret&teamId=SECRET', GUEST))
      );
      expect(dirigido.groups.flatMap((g: { items: unknown[] }) => g.items)).toEqual([]);
   });

   it('fila de triagem de time alheio: 403', async () => {
      expect(
         status(
            await teamTriageRoute(req('http://x/api/v1/teams/SECRET/triage-suggestions', GUEST), {
               params: Promise.resolve({ teamKey: 'SECRET' }),
            })
         )
      ).toBe(403);
   });

   it('leituras por time (documentos, membros, cycles) e por id (view): 403', async () => {
      // Ficaram sem gate nas duas levas: a ESCRITA de documento exigia ser membro, a
      // leitura não; membros permitia enumerar quem trabalha onde; e o GET de cycles
      // ainda DISPARA o rollover (fecha cycles e migra issues) do time alheio.
      const tp = { params: Promise.resolve({ teamKey: 'SECRET' }) };
      expect(
         status(await teamDocumentsRoute(req('http://x/api/v1/teams/SECRET/documents', GUEST), tp))
      ).toBe(403);
      expect(
         status(await teamMembersRoute(req('http://x/api/v1/teams/SECRET/members', GUEST), tp))
      ).toBe(403);
      expect(
         status(await teamCyclesRoute(req('http://x/api/v1/teams/SECRET/cycles', GUEST), tp))
      ).toBe(403);
      expect(
         status(
            await getViewRoute(
               req(`http://x/api/v1/views/${ids.secretView}`, GUEST),
               params({ id: ids.secretView })
            )
         )
      ).toBe(403);
   });

   it('favoritos não resolvem entidade fora do escopo', async () => {
      const { addFavorite, listFavorites } = await import('@/lib/api/favorites');
      await addFavorite(db, GUEST, 'issue', ids.secretIssue);
      await addFavorite(db, GUEST, 'issue', ids.openIssue);
      const favs = await listFavorites(db, GUEST);
      // A linha do favorito continua no banco; o que some é o título da issue alheia.
      expect(favs.map((f) => f.entityId)).toEqual([ids.openIssue]);
      expect(status(await favoritesRoute(req('http://x/api/v1/favorites', GUEST)))).toBe(200);
   });

   it('anexar arquivo em issue alheia: 403 (a rota era exceção do guarda de escrita)', async () => {
      // O serviço checava só a EXISTÊNCIA da issue. Anexar é escrever nela: o time importa.
      const { createAttachment } = await import('@/lib/api/attachments');
      await expect(
         createAttachment(
            db,
            {
               issueId: ids.secretIssue,
               commentId: null,
               file: { name: 'a.txt', type: 'text/plain', bytes: Buffer.from('oi') },
            },
            GUEST
         )
      ).rejects.toMatchObject({ status: 403 });
   });

   it('sub-rotas de issues/{id}: labels, rank, relations, subscription e triage dão 403', async () => {
      const p = params({ id: ids.secretIssue });
      const url = `http://x/api/v1/issues/${ids.secretIssue}`;
      expect(
         status(await addLabelRoute(wreq(`${url}/labels`, GUEST, 'POST', { labelId: 'bug' }), p))
      ).toBe(403);
      expect(
         status(
            await removeLabelRoute(
               wreq(`${url}/labels/bug`, GUEST, 'DELETE'),
               params({ id: ids.secretIssue, labelId: 'bug' })
            )
         )
      ).toBe(403);
      expect(
         status(await rankRoute(wreq(`${url}/rank`, GUEST, 'PATCH', { beforeId: null }), p))
      ).toBe(403);
      expect(status(await subscribeRoute(wreq(`${url}/subscription`, GUEST, 'POST'), p))).toBe(403);
      expect(status(await unsubscribeRoute(wreq(`${url}/subscription`, GUEST, 'DELETE'), p))).toBe(
         403
      );
      expect(status(await triageSuggestionRoute(req(`${url}/triage-suggestion`, GUEST), p))).toBe(
         403
      );
      expect(
         status(
            await triageAcceptRoute(wreq(`${url}/triage-suggestion/accept`, GUEST, 'POST', {}), p)
         )
      ).toBe(403);
      expect(
         status(
            await triageDismissRoute(wreq(`${url}/triage-suggestion/dismiss`, GUEST, 'POST'), p)
         )
      ).toBe(403);
   });

   it('relations: 403 nas DUAS pontas (origem alheia e alvo alheio)', async () => {
      const secret = `http://x/api/v1/issues/${ids.secretIssue}/relations`;
      expect(
         status(
            await addRelationRoute(
               wreq(secret, GUEST, 'POST', { relatedId: ids.openIssue, kind: 'related' }),
               params({ id: ids.secretIssue })
            )
         )
      ).toBe(403);

      // Origem no time do guest, ALVO de fora: puxaria a issue alheia para o feed dele.
      const open = `http://x/api/v1/issues/${ids.openIssue}/relations`;
      expect(
         status(
            await addRelationRoute(
               wreq(open, GUEST, 'POST', { relatedId: ids.secretIssue, kind: 'related' }),
               params({ id: ids.openIssue })
            )
         )
      ).toBe(403);
      expect(
         status(
            await removeRelationRoute(
               wreq(`${open}?relatedId=${ids.secretIssue}&kind=related`, GUEST, 'DELETE'),
               params({ id: ids.openIssue })
            )
         )
      ).toBe(403);
   });

   it('POST/PATCH/DELETE /projects: 403 fora do escopo — e mover para o próprio time também', async () => {
      expect(
         status(
            await createProjectRoute(
               wreq('http://x/api/v1/projects', GUEST, 'POST', {
                  name: 'P invasor',
                  statusId: 'proj-in-progress',
                  priorityId: 'high',
                  healthId: 'on-track',
                  teamId: 'SECRET',
               })
            )
         )
      ).toBe(403);

      const secret = params({ id: ids.secretProject });
      const url = `http://x/api/v1/projects/${ids.secretProject}`;
      expect(
         status(await patchProjectRoute(wreq(url, GUEST, 'PATCH', { name: 'x' }), secret))
      ).toBe(403);
      expect(status(await deleteProjectRoute(wreq(url, GUEST, 'DELETE'), secret))).toBe(403);
      // A ESCALAÇÃO: puxar o projeto alheio para o time do guest fazia o GET passar a valer.
      expect(
         status(await patchProjectRoute(wreq(url, GUEST, 'PATCH', { teamId: 'OPEN' }), secret))
      ).toBe(403);
      // E o inverso (empurrar o próprio projeto para fora) também é movimento inválido.
      expect(
         status(
            await patchProjectRoute(
               wreq(`http://x/api/v1/projects/${ids.openProject}`, GUEST, 'PATCH', {
                  teamId: 'SECRET',
               }),
               params({ id: ids.openProject })
            )
         )
      ).toBe(403);
   });

   it('sub-recursos de projeto alheio (detail, milestones, resources, updates, progress): 403', async () => {
      const p = params({ id: ids.secretProject });
      const url = `http://x/api/v1/projects/${ids.secretProject}`;
      expect(
         status(
            await patchProjectDetailRoute(
               wreq(`${url}/detail`, GUEST, 'PATCH', { summary: 'hack' }),
               p
            )
         )
      ).toBe(403);
      expect(status(await projectProgressRoute(req(`${url}/progress`, GUEST), p))).toBe(403);
      expect(status(await listMilestonesRoute(req(`${url}/milestones`, GUEST), p))).toBe(403);
      expect(
         status(await addMilestoneRoute(wreq(`${url}/milestones`, GUEST, 'POST', { name: 'M' }), p))
      ).toBe(403);
      expect(status(await listResourcesRoute(req(`${url}/resources`, GUEST), p))).toBe(403);
      expect(
         status(
            await addResourceRoute(
               wreq(`${url}/resources`, GUEST, 'POST', { label: 'L', url: 'https://x' }),
               p
            )
         )
      ).toBe(403);
      expect(status(await listProjectUpdatesRoute(req(`${url}/updates`, GUEST), p))).toBe(403);
      expect(
         status(
            await postProjectUpdateRoute(
               wreq(`${url}/updates`, GUEST, 'POST', { health: 'on-track', blocks: [] }),
               p
            )
         )
      ).toBe(403);
   });

   it('milestone/resource: o {id} do projeto na URL é respeitado (nada de editar por id global)', async () => {
      const secretUrl = `http://x/api/v1/projects/${ids.secretProject}`;
      expect(
         status(
            await patchMilestoneRoute(
               wreq(`${secretUrl}/milestones/${ids.secretMilestone}`, GUEST, 'PATCH', {
                  name: 'x',
               }),
               params({ id: ids.secretProject, mid: ids.secretMilestone })
            )
         )
      ).toBe(403);
      expect(
         status(
            await deleteResourceRoute(
               wreq(`${secretUrl}/resources/${ids.secretResource}`, GUEST, 'DELETE'),
               params({ id: ids.secretProject, rid: ids.secretResource })
            )
         )
      ).toBe(403);

      // Truque do id global: URL do projeto do guest, id do recurso do outro projeto.
      const openUrl = `http://x/api/v1/projects/${ids.openProject}`;
      expect(
         status(
            await patchMilestoneRoute(
               wreq(`${openUrl}/milestones/${ids.secretMilestone}`, GUEST, 'PATCH', { name: 'x' }),
               params({ id: ids.openProject, mid: ids.secretMilestone })
            )
         )
      ).toBe(404);
      expect(
         status(
            await deleteMilestoneRoute(
               wreq(`${openUrl}/milestones/${ids.secretMilestone}`, GUEST, 'DELETE'),
               params({ id: ids.openProject, mid: ids.secretMilestone })
            )
         )
      ).toBe(404);
      expect(
         status(
            await patchResourceRoute(
               wreq(`${openUrl}/resources/${ids.secretResource}`, GUEST, 'PATCH', { label: 'x' }),
               params({ id: ids.openProject, rid: ids.secretResource })
            )
         )
      ).toBe(404);
      expect(
         status(
            await deleteResourceRoute(
               wreq(`${openUrl}/resources/${ids.secretResource}`, GUEST, 'DELETE'),
               params({ id: ids.openProject, rid: ids.secretResource })
            )
         )
      ).toBe(404);

      // O próprio projeto segue editável.
      expect(
         status(
            await patchMilestoneRoute(
               wreq(`${openUrl}/milestones/${ids.openMilestone}`, GUEST, 'PATCH', { name: 'ok' }),
               params({ id: ids.openProject, mid: ids.openMilestone })
            )
         )
      ).toBe(200);
   });

   it('PUT /projects/{id}/dependencies: valida também os ALVOS, não só a ponta da URL', async () => {
      expect(
         status(
            await putDependenciesRoute(
               wreq(`http://x/api/v1/projects/${ids.openProject}/dependencies`, GUEST, 'PUT', {
                  dependsOn: [ids.secretProject],
               }),
               params({ id: ids.openProject })
            )
         )
      ).toBe(403);
   });

   it('POST /views: valida existência E escopo do teamId', async () => {
      expect(
         status(
            await createViewRoute(
               wreq('http://x/api/v1/views', GUEST, 'POST', {
                  slug: 'v-secret',
                  name: 'V',
                  type: 'issue',
                  filter: {},
                  teamId: 'SECRET',
               })
            )
         )
      ).toBe(403);
      expect(
         status(
            await createViewRoute(
               wreq('http://x/api/v1/views', GUEST, 'POST', {
                  slug: 'v-ghost',
                  name: 'V',
                  type: 'issue',
                  filter: {},
                  teamId: 'NAO-EXISTE',
               })
            )
         )
      ).toBe(404);
   });

   it('POST /import/commit: 403 quando o teamId é de outro time', async () => {
      expect(
         status(
            await importCommitRoute(
               wreq('http://x/api/v1/import/commit', GUEST, 'POST', {
                  source: 'csv',
                  csv: 'title\nimportada',
                  teamId: 'SECRET',
                  mapping: { title: 'title' },
               })
            )
         )
      ).toBe(403);
   });

   it('initiatives: 403 na de fora e ao vincular projeto de outro time', async () => {
      const p = params({ id: ids.secretInitiative });
      const url = `http://x/api/v1/initiatives/${ids.secretInitiative}`;
      expect(status(await patchInitiativeRoute(wreq(url, GUEST, 'PATCH', { name: 'x' }), p))).toBe(
         403
      );
      expect(status(await deleteInitiativeRoute(wreq(url, GUEST, 'DELETE'), p))).toBe(403);
      expect(status(await initiativeActivityRoute(req(`${url}/activity`, GUEST), p))).toBe(403);
      expect(
         status(
            await postInitiativeUpdateRoute(
               wreq(`${url}/updates`, GUEST, 'POST', { health: 'on-track', blocks: [] }),
               p
            )
         )
      ).toBe(403);
      expect(
         status(
            await createInitiativeRoute(
               wreq('http://x/api/v1/initiatives', GUEST, 'POST', {
                  slug: 'i-invasora',
                  name: 'I',
                  priorityId: 'high',
                  healthId: 'on-track',
                  projectIds: [ids.secretProject],
               })
            )
         )
      ).toBe(403);
   });

   it('GET /issues/export e /issues/aggregate não devolvem o workspace inteiro', async () => {
      const csv = await (
         await exportIssuesRoute(req('http://x/api/v1/issues/export', GUEST))
      ).text();
      expect(csv).toContain('aberta');
      expect(csv).not.toContain('secreta');

      const bundle = await (
         await exportIssuesRoute(req('http://x/api/v1/issues/export?format=json', GUEST))
      ).json();
      expect(bundle.issues.map((i: { title: string }) => i.title).sort()).toEqual([
         'aberta',
         'sub',
      ]);

      // Agregações: com time fora do escopo, 403; sem time, o guest não recebe o total global.
      expect(
         status(await aggregateRoute(req('http://x/api/v1/issues/aggregate?team=SECRET', GUEST)))
      ).toBe(403);
      const matrix = await aggregateRoute(req('http://x/api/v1/issues/aggregate?team=OPEN', GUEST));
      expect(status(matrix)).toBe(200);
   });
});

describe('integridade de deleteIssue', () => {
   it('apaga issue importada sem estourar chave estrangeira (issue_import)', async () => {
      const res = await commitImport(
         db,
         {
            source: 'csv',
            csv: 'externalId,title\nEXT-1,Importada',
            teamId: 'OPEN',
            mapping: { externalId: 'externalId', title: 'title' },
         },
         ADMIN
      );
      expect(res.created).toBe(1);
      const importedId = res.issueIds[0];
      await expect(deleteIssue(db, importedId)).resolves.toBe(true);
   });
});
