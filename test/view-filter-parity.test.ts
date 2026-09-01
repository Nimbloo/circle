import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createView, resolveView } from '@/lib/api/views';
import { createIssue, listIssues } from '@/lib/api/issues';
import { createProject, listProjects } from '@/lib/api/projects';
import { adaptIssues } from '@/lib/adapters';
import { adaptProject } from '@/lib/adapters-workspace';
import { filterIssuesForView, filterProjectsForView, type View } from '@/data/views';
import type { ViewDto } from '@/lib/api/views';

/**
 * PARIDADE ENTRE OS DOIS FILTROS DE VIEW.
 *
 * O mesmo filtro declarativo é aplicado em DOIS lugares: `resolveView` (servidor,
 * `lib/api/views.ts`) e `filterIssuesForView`/`filterProjectsForView` (cliente,
 * `data/views.ts`). A UI usa o do cliente — de propósito: filtrar sobre o store já
 * hidratado mantém a view reagindo ao realtime sem round-trip. O do servidor é a
 * API para consumidores de máquina (Bearer/service account).
 *
 * Duas implementações da mesma regra divergem em silêncio — já divergiram antes
 * (ver os comentários em `data/views.ts`, onde `statusIds` era ignorado no cliente
 * e `labelIds` só existia no servidor). Este teste trava as duas no mesmo resultado.
 */

const ME = 'ana@nimbloo.ai';

/** O `View` da UI é o DTO com o filtro; só o `filter` importa para estes testes. */
const asView = (dto: ViewDto): View => dto as unknown as View;

async function workspace() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ME, teamIds: ['CORE'] });
   return db;
}

describe('paridade do filtro de view (servidor x cliente)', () => {
   it('issue view: statusIds, priorityIds e unassigned dão o mesmo conjunto', async () => {
      const db = await workspace();
      const base = { teamId: 'CORE' as const };
      await createIssue(
         db,
         { ...base, title: 'A', statusId: 'in-progress', priorityId: 'high' },
         ME
      );
      await createIssue(db, { ...base, title: 'B', statusId: 'to-do', priorityId: 'high' }, ME);
      await createIssue(
         db,
         { ...base, title: 'C', statusId: 'in-progress', priorityId: 'low' },
         ME
      );

      const filters = [
         { statusIds: ['in-progress'] },
         { priorityIds: ['high'] },
         { statusIds: ['in-progress'], priorityIds: ['high'] },
         { unassigned: true },
         {},
      ];

      for (const [i, filter] of filters.entries()) {
         const dto = await createView(
            db,
            { slug: `v${i}`, name: `V${i}`, type: 'issue', filter },
            ME
         );

         const server = await resolveView(db, dto.id);
         const client = filterIssuesForView(asView(dto), adaptIssues(await listIssues(db, {})));

         expect(
            (server?.issues ?? []).map((x) => x.id).sort(),
            `filtro ${JSON.stringify(filter)}`
         ).toEqual(client.map((x) => x.id).sort());
      }
   });

   it('project view: statusIds e priorityIds dão o mesmo conjunto', async () => {
      const db = await workspace();
      const base = { healthId: 'on-track', teamId: 'CORE' as const };
      await createProject(db, {
         name: 'P1',
         statusId: 'proj-in-progress',
         priorityId: 'high',
         ...base,
      });
      await createProject(db, {
         name: 'P2',
         statusId: 'proj-completed',
         priorityId: 'high',
         ...base,
      });
      await createProject(db, {
         name: 'P3',
         statusId: 'proj-in-progress',
         priorityId: 'low',
         ...base,
      });

      const filters = [
         { statusIds: ['proj-in-progress'] },
         { priorityIds: ['low'] },
         { statusIds: ['proj-completed'], priorityIds: ['high'] },
         {},
      ];

      for (const [i, filter] of filters.entries()) {
         const dto = await createView(
            db,
            { slug: `pv${i}`, name: `PV${i}`, type: 'project', filter },
            ME
         );

         const server = await resolveView(db, dto.id);
         const client = filterProjectsForView(
            asView(dto),
            (await listProjects(db, {})).map(adaptProject)
         );

         expect(
            (server?.projects ?? []).map((x) => x.id).sort(),
            `filtro ${JSON.stringify(filter)}`
         ).toEqual(client.map((x) => x.id).sort());
      }
   });
});
