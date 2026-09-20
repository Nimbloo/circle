import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { issue as issueT } from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createIssue, getIssue, updateIssue } from '@/lib/api/issues';
import { createProject } from '@/lib/api/projects';
import {
   createAutomation,
   listTeamAutomations,
   runAutomations,
   updateAutomation,
} from '@/lib/api/automations';

/**
 * Ad#28 — as ações `set_status` e `close_sub_issues` escrevem direto na tabela e não
 * publicavam o rollup (pai, projeto, ciclo) nem limpavam `completedAt` ao reabrir.
 */
const ANA = 'ana@nimbloo.ai';
let db: Db;
let events: CircleEvent[];
let stop: () => void;
let projectId: string;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin', teamIds: ['CORE'] });
   projectId = (
      await createProject(db, {
         name: 'P',
         teamId: 'CORE',
         statusId: 'proj-in-progress',
         priorityId: 'high',
         healthId: 'on-track',
      })
   ).id;
   events = [];
   stop = subscribe((e) => events.push(e));
});
afterEach(() => stop());

async function completedAt(id: string) {
   const [row] = await db
      .select({ completedAt: issueT.completedAt })
      .from(issueT)
      .where(eq(issueT.id, id));
   return row?.completedAt ?? null;
}

const updated = (entity: string, id: string) =>
   events.some((e) => e.entity === entity && e.action === 'updated' && e.id === id);

describe('automações publicam rollup (Ad#28)', () => {
   it('set_status publica o pai e o projeto da issue', async () => {
      const parent = await createIssue(
         db,
         { teamId: 'CORE', title: 'Pai', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const child = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Filha',
            statusId: 'in-progress',
            priorityId: 'low',
            parentId: parent.id,
            projectId,
         },
         ANA
      );
      events.length = 0;
      // Regra default semeada: PR mergeado → Done.
      expect(await runAutomations(db, 'pr.merged', child.id, { actorId: null })).toBe(1);
      expect(updated('issue', parent.id)).toBe(true);
      expect(updated('project', projectId)).toBe(true);
   });

   it('set_status para fora de "completed" limpa completedAt', async () => {
      const [seeded] = await listTeamAutomations(db, 'CORE');
      await updateAutomation(db, seeded.id, { config: { statusId: 'in-progress' } });
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Reabrir', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      await updateIssue(db, dto.id, { statusId: 'done' }, ANA, { silent: true });
      expect(await completedAt(dto.id)).toBeTruthy();

      expect(await runAutomations(db, 'pr.merged', dto.id, { actorId: null })).toBe(1);
      expect((await getIssue(db, dto.id))?.status.id).toBe('in-progress');
      expect(await completedAt(dto.id)).toBeNull();
   });

   it('close_sub_issues publica o projeto das filhas fechadas', async () => {
      const parent = await createIssue(
         db,
         { teamId: 'CORE', title: 'Pai', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Filha',
            statusId: 'to-do',
            priorityId: 'low',
            parentId: parent.id,
            projectId,
         },
         ANA
      );
      await createAutomation(db, 'CORE', {
         name: 'Fecha filhas',
         trigger: 'issue.status_changed',
         action: 'close_sub_issues',
         config: { toCategory: 'completed' },
      });
      events.length = 0;
      expect(
         await runAutomations(db, 'issue.status_changed', parent.id, {
            actorId: null,
            toCategory: 'completed',
         })
      ).toBe(1);
      expect(updated('project', projectId)).toBe(true);
   });
});
