import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import type { Db } from '@/db';
import { createIssue } from '@/lib/api/issues';
import { updateIssueContent } from '@/lib/api/issue-detail';
import { subscribe, type CircleEvent } from '@/lib/api/events';

let db: Db;
beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
});

describe('evento de conteúdo da issue (#18)', () => {
   it('salvar a descrição publica issue com scope content (o DTO da lista não mudou)', async () => {
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'to-do', priorityId: 'high' },
         'dev@nimbloo.ai'
      );
      const seen: CircleEvent[] = [];
      const unsub = subscribe((e) => seen.push(e));
      await updateIssueContent(db, dto.id, { description: 'nova' }, 'dev@nimbloo.ai');
      unsub();
      const ev = seen.find((e) => e.entity === 'issue' && e.id === dto.id);
      expect(ev).toMatchObject({ action: 'updated', scope: 'content', teamId: 'CORE' });
   });
});
