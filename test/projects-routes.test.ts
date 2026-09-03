import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { PATCH as patchProject } from '@/app/api/v1/projects/[id]/route';
import { createProject } from '@/lib/api/projects';
import { createIssue, getIssue } from '@/lib/api/issues';
import { getProjectDetail } from '@/lib/api/project-detail';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'DESIGN', 'Design');
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

function patch(id: string, body: unknown, email = 'dev@nimbloo.ai') {
   return patchProject(
      new Request(`http://x/api/v1/projects/${id}`, {
         method: 'PATCH',
         headers: { 'content-type': 'application/json', 'x-forwarded-email': email },
         body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
   );
}

async function seedProject() {
   return createProject(db, {
      name: 'Core Components',
      statusId: 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
      teamId: 'CORE',
   });
}

describe('PATCH /api/v1/projects/{id} — teamId (board por time)', () => {
   it('move o projeto para outro time e registra "changed team"; issues ficam no time original', async () => {
      const project = await seedProject();
      const issue = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Botão',
            statusId: 'to-do',
            priorityId: 'high',
            projectId: project.id,
         },
         'dev@nimbloo.ai'
      );

      const res = await patch(project.id, { teamId: 'DESIGN' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.teamId).toBe('DESIGN');

      // Issues do projeto NÃO mudam de time (o identifier CORE-n continua válido).
      expect((await getIssue(db, issue.id))?.teamId).toBe('CORE');

      const detail = await getProjectDetail(db, project.id);
      expect(detail?.activity).toHaveLength(1);
      expect(detail?.activity[0].text).toContain('team');
   });

   it('time inexistente → 400 problem+json, sem alterar o projeto', async () => {
      const project = await seedProject();

      const res = await patch(project.id, { teamId: 'NOPE' });
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/problem+json');

      const detail = await getProjectDetail(db, project.id);
      expect(detail?.activity).toHaveLength(0);
   });

   it('teamId vazio falha na validação do payload (400)', async () => {
      const project = await seedProject();
      const res = await patch(project.id, { teamId: '' });
      expect(res.status).toBe(400);
   });
});
