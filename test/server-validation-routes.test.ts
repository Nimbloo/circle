import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { POST as createIssue } from '@/app/api/v1/issues/route';
import { PATCH as updateIssue } from '@/app/api/v1/issues/[id]/route';
import { POST as createProject } from '@/app/api/v1/projects/route';
import { PATCH as updateProject } from '@/app/api/v1/projects/[id]/route';
import { POST as createInitiative } from '@/app/api/v1/initiatives/route';
import { PATCH as updateInitiative } from '@/app/api/v1/initiatives/[id]/route';
import { POST as createTeam } from '@/app/api/v1/teams/route';
import { PATCH as updateTeam } from '@/app/api/v1/teams/[teamKey]/route';
import { POST as createLabel } from '@/app/api/v1/labels/route';
import { PATCH as updateLabel } from '@/app/api/v1/labels/[id]/route';
import { POST as createStatus } from '@/app/api/v1/statuses/route';
import { PATCH as updateStatus } from '@/app/api/v1/statuses/[id]/route';
import { POST as createView } from '@/app/api/v1/views/route';
import { PATCH as updateView } from '@/app/api/v1/views/[id]/route';
import { POST as createDocument } from '@/app/api/v1/teams/[teamKey]/documents/route';
import { PATCH as updateDocument } from '@/app/api/v1/documents/[id]/route';
import { POST as createTemplate } from '@/app/api/v1/teams/[teamKey]/templates/route';
import { PATCH as updateTemplate } from '@/app/api/v1/teams/[teamKey]/templates/[id]/route';
import { POST as createProjectTemplate } from '@/app/api/v1/teams/[teamKey]/project-templates/route';
import { PATCH as updateProjectTemplate } from '@/app/api/v1/teams/[teamKey]/project-templates/[id]/route';
import { POST as createCycle } from '@/app/api/v1/teams/[teamKey]/cycles/route';
import { PATCH as updateCycle } from '@/app/api/v1/cycles/[id]/route';
import { GET as readCycle } from '@/app/api/v1/cycles/[id]/route';

const ADMIN = 'admin@nimbloo.ai';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, {
      name: 'Admin',
      email: ADMIN,
      role: 'Admin',
      teamIds: ['CORE'],
   });
   __setTestDb(db);
});

function request(method: string, url: string, body: unknown) {
   return new Request(`http://x${url}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-email': ADMIN },
      body: JSON.stringify(body),
   });
}

async function expectValidation(res: Response, field: string, message?: string) {
   expect(res.status).toBe(400);
   const body = await res.json();
   expect(body.errors.fieldErrors[field]).toBeTruthy();
   if (message) expect(body.errors.fieldErrors[field]).toContain(message);
}

describe('validação textual das rotas da frente S', () => {
   it('recusa títulos de issue vazios após trim na criação e edição', async () => {
      await expectValidation(
         await createIssue(
            request('POST', '/api/v1/issues', {
               teamId: 'CORE',
               title: '   ',
               statusId: 'to-do',
               priorityId: 'high',
            })
         ),
         'title'
      );
      await expectValidation(
         await updateIssue(request('PATCH', '/api/v1/issues/missing', { title: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'title'
      );
   });

   it('recusa nomes vazios nas rotas de projeto, initiative e time', async () => {
      await expectValidation(
         await createProject(
            request('POST', '/api/v1/projects', {
               name: '   ',
               statusId: 'proj-in-progress',
               priorityId: 'high',
               healthId: 'on-track',
               teamId: 'CORE',
            })
         ),
         'name'
      );
      await expectValidation(
         await updateProject(request('PATCH', '/api/v1/projects/missing', { name: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'name'
      );
      await expectValidation(
         await createInitiative(
            request('POST', '/api/v1/initiatives', {
               slug: 'x',
               name: '   ',
               priorityId: 'high',
               healthId: 'on-track',
            })
         ),
         'name'
      );
      await expectValidation(
         await updateInitiative(request('PATCH', '/api/v1/initiatives/missing', { name: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'name'
      );
      await expectValidation(
         await createTeam(request('POST', '/api/v1/teams', { id: 'CORE2', name: '   ' })),
         'name'
      );
      await expectValidation(
         await updateTeam(request('PATCH', '/api/v1/teams/CORE', { name: '   ' }), {
            params: Promise.resolve({ teamKey: 'CORE' }),
         }),
         'name'
      );
   });

   it('recusa nomes vazios nas rotas de label, status, view e documento', async () => {
      await expectValidation(
         await createLabel(request('POST', '/api/v1/labels', { name: '   ', color: 'red' })),
         'name'
      );
      await expectValidation(
         await updateLabel(request('PATCH', '/api/v1/labels/missing', { name: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'name'
      );
      await expectValidation(
         await createStatus(
            request('POST', '/api/v1/statuses', { name: '   ', color: 'red', category: 'started' })
         ),
         'name'
      );
      await expectValidation(
         await updateStatus(request('PATCH', '/api/v1/statuses/missing', { name: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'name'
      );
      await expectValidation(
         await createView(
            request('POST', '/api/v1/views', { slug: 'x', name: '   ', type: 'issue', filter: {} })
         ),
         'name'
      );
      await expectValidation(
         await updateView(request('PATCH', '/api/v1/views/missing', { name: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'name'
      );
      await expectValidation(
         await createDocument(
            request('POST', '/api/v1/teams/CORE/documents', { kind: 'folder', name: '   ' }),
            {
               params: Promise.resolve({ teamKey: 'CORE' }),
            }
         ),
         'name'
      );
      await expectValidation(
         await updateDocument(request('PATCH', '/api/v1/documents/missing', { name: '   ' }), {
            params: Promise.resolve({ id: 'missing' }),
         }),
         'name'
      );
   });

   it('recusa nomes vazios e capacidade inválida nas rotas de template e ciclo', async () => {
      await expectValidation(
         await createTemplate(request('POST', '/api/v1/teams/CORE/templates', { name: '   ' }), {
            params: Promise.resolve({ teamKey: 'CORE' }),
         }),
         'name'
      );
      await expectValidation(
         await updateTemplate(
            request('PATCH', '/api/v1/teams/CORE/templates/missing', { name: '   ' }),
            {
               params: Promise.resolve({ teamKey: 'CORE', id: 'missing' }),
            }
         ),
         'name'
      );
      await expectValidation(
         await createProjectTemplate(
            request('POST', '/api/v1/teams/CORE/project-templates', { name: '   ' }),
            {
               params: Promise.resolve({ teamKey: 'CORE' }),
            }
         ),
         'name'
      );
      await expectValidation(
         await updateProjectTemplate(
            request('PATCH', '/api/v1/teams/CORE/project-templates/missing', { name: '   ' }),
            {
               params: Promise.resolve({ teamKey: 'CORE', id: 'missing' }),
            }
         ),
         'name'
      );
      await expectValidation(
         await createCycle(
            request('POST', '/api/v1/teams/CORE/cycles', {
               name: '   ',
               startDate: '2026-01-01',
               endDate: '2026-01-14',
               capacity: -1,
            }),
            { params: Promise.resolve({ teamKey: 'CORE' }) }
         ),
         'name'
      );
      const invalidCapacity = await updateCycle(
         request('PATCH', '/api/v1/cycles/missing', { capacity: -1 }),
         { params: Promise.resolve({ id: 'missing' }) }
      );
      await expectValidation(
         invalidCapacity,
         'capacity',
         'capacity deve ser um inteiro maior ou igual a zero'
      );
   });

   it('rejeita nome acima de 128 caracteres com 400 claro', async () => {
      const res = await createProject(
         request('POST', '/api/v1/projects', {
            name: 'x'.repeat(129),
            statusId: 'proj-in-progress',
            priorityId: 'high',
            healthId: 'on-track',
            teamId: 'CORE',
         })
      );
      await expectValidation(res, 'name');
   });

   it('lê um ciclo completed pelo endpoint de detalhe', async () => {
      const created = await createCycle(
         request('POST', '/api/v1/teams/CORE/cycles', {
            name: 'Encerrado',
            startDate: '2026-01-01',
            endDate: '2026-01-14',
            status: 'completed',
         }),
         { params: Promise.resolve({ teamKey: 'CORE' }) }
      );
      expect(created.status).toBe(200);
      const id = (await created.json()).data.id;
      const read = await readCycle(request('GET', `/api/v1/cycles/${id}`, undefined), {
         params: Promise.resolve({ id }),
      });
      expect(read.status).toBe(200);
      expect((await read.json()).data.status).toBe('completed');
   });
});
