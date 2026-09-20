import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { deleteTeam } from '@/lib/api/teams';
import { setTeamSla } from '@/lib/api/slas';
import { ensureDefaultAutomations, listTeamAutomations } from '@/lib/api/automations';
import { team as teamT, teamAutomation, teamSla } from '@/db/schema';
import { eq } from 'drizzle-orm';

import { GET as listTeamsRoute } from '@/app/api/v1/teams/route';
import { GET as getTeamRoute } from '@/app/api/v1/teams/[teamKey]/route';

/**
 * TIMES: fail-open na leitura e time indelével.
 *
 * As duas rotas de leitura usavam `emailFromRequest`, que devolve `null` sem sessão —
 * o escopo virava `null` (= irrestrito) e o assert era PULADO. A auditoria listou
 * `OPEN` e `SECRET` sem sessão nenhuma (só o middleware protegia).
 *
 * E `deleteTeam` não limpava `team_sla`/`team_automation`: como
 * `ensureDefaultAutomations` semeia a regra padrão na primeira leitura, quase todo
 * time ficava indelével (23503 → 404 enganoso).
 */

const ADMIN = 'ana@nimbloo.ai';

let db: Db;

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedTeam(db, 'SECRET', 'Secret');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['OPEN', 'SECRET'] });
});
afterEach(() => __setTestDb(null));

describe('rotas de time não respondem sem identidade', () => {
   it('GET /teams sem sessão → 401, não a lista inteira', async () => {
      const res = await listTeamsRoute(new Request('http://x/api/v1/teams'));
      expect(res.status).toBe(401);
   });

   it('GET /teams/{key} sem sessão → 401, não o time', async () => {
      const res = await getTeamRoute(
         new Request('http://x/api/v1/teams/SECRET'),
         params({ teamKey: 'SECRET' })
      );
      expect(res.status).toBe(401);
   });

   it('com sessão, segue respondendo normalmente', async () => {
      const req = (u: string) => new Request(u, { headers: { 'x-forwarded-email': ADMIN } });
      expect((await listTeamsRoute(req('http://x/api/v1/teams'))).status).toBe(200);
      expect(
         (await getTeamRoute(req('http://x/api/v1/teams/SECRET'), params({ teamKey: 'SECRET' })))
            .status
      ).toBe(200);
   });
});

describe('deleteTeam limpa a configuração do time', () => {
   it('time vazio com SLA e automação padrão é apagável', async () => {
      await setTeamSla(db, 'OPEN', 'high', 4);
      // A regra padrão nasce sozinha na primeira leitura — é o que travava a deleção.
      await ensureDefaultAutomations(db, 'OPEN');
      expect((await listTeamAutomations(db, 'OPEN')).length).toBeGreaterThan(0);

      expect(await deleteTeam(db, 'OPEN')).toBe(true);
      expect(await db.select().from(teamT).where(eq(teamT.id, 'OPEN'))).toEqual([]);
      expect(await db.select().from(teamSla).where(eq(teamSla.teamId, 'OPEN'))).toEqual([]);
      expect(
         await db.select().from(teamAutomation).where(eq(teamAutomation.teamId, 'OPEN'))
      ).toEqual([]);
   });
});

describe('deleteTeam em transação trata templates (#59)', () => {
   it('templates de issue e projeto são configuração: somem com o time', async () => {
      const { createTemplate } = await import('@/lib/api/templates');
      const { createProjectTemplate } = await import('@/lib/api/project-templates');
      const { issueTemplate, projectTemplate } = await import('@/db/schema');
      await createTemplate(db, { teamId: 'OPEN', name: 'Bug' });
      await createProjectTemplate(db, { teamId: 'OPEN', name: 'Launch' });

      expect(await deleteTeam(db, 'OPEN')).toBe(true);
      expect(await db.select().from(teamT).where(eq(teamT.id, 'OPEN'))).toEqual([]);
      expect(await db.select().from(issueTemplate).where(eq(issueTemplate.teamId, 'OPEN'))).toEqual(
         []
      );
      expect(
         await db.select().from(projectTemplate).where(eq(projectTemplate.teamId, 'OPEN'))
      ).toEqual([]);
   });
});

describe('deleteTeam com conteúdo apaga em cascata (paridade Linear)', () => {
   it('issues e projeto criados pelos serviços somem com o time', async () => {
      const { createIssue } = await import('@/lib/api/issues');
      const { createProject } = await import('@/lib/api/projects');
      const { getTeamDeletionImpact } = await import('@/lib/api/teams');
      const { issue, project } = await import('@/db/schema');
      await seedUser(db, { name: 'Ana', email: 'ana@x.com' });
      await createIssue(
         db,
         { teamId: 'OPEN', title: 'A', statusId: 'backlog', priorityId: 'low' },
         'ana@x.com'
      );
      await createIssue(
         db,
         { teamId: 'OPEN', title: 'B', statusId: 'backlog', priorityId: 'low' },
         'ana@x.com'
      );
      await createProject(db, {
         name: 'P',
         teamId: 'OPEN',
         statusId: 'proj-in-progress',
         priorityId: 'high',
         healthId: 'on-track',
      });
      expect(await getTeamDeletionImpact(db, 'OPEN')).toMatchObject({ issues: 2, projects: 1 });

      expect(await deleteTeam(db, 'OPEN')).toBe(true);
      expect(await db.select().from(teamT).where(eq(teamT.id, 'OPEN'))).toEqual([]);
      expect(await db.select().from(issue).where(eq(issue.teamId, 'OPEN'))).toEqual([]);
      expect(await db.select().from(project).where(eq(project.teamId, 'OPEN'))).toEqual([]);
   });
});
