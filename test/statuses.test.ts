import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createStatus, updateStatus, deleteStatus, reorderStatuses } from '@/lib/api/statuses';
import { createIssue } from '@/lib/api/issues';
import { ApiError } from '@/lib/api/errors';

const ME = 'dev@nimbloo.ai';

describe('status catalog CRUD', () => {
   it('cria, edita e exclui um status que não está em uso', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');

      const s = await createStatus(db, {
         name: 'Em revisão',
         color: '#ff0000',
         category: 'started',
      });
      expect(s.id).toBeTruthy();
      expect(s.category).toBe('started');
      expect(s.position).toBeGreaterThan(0);

      const u = await updateStatus(db, s.id, { name: 'Review' });
      expect(u?.name).toBe('Review');

      expect(await deleteStatus(db, s.id)).toBe(true);
   });

   it('BLOQUEIA exclusão de status em uso por uma issue (409)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await createIssue(
         db,
         { teamId: 'CORE', title: 'x', statusId: 'to-do', priorityId: 'high' },
         ME
      );
      await expect(deleteStatus(db, 'to-do')).rejects.toMatchObject({ status: 409 });
   });

   it('rejeita categoria inválida', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await expect(
         createStatus(db, { name: 'x', color: '#000000', category: 'nope' })
      ).rejects.toThrow(ApiError);
   });

   it('reordena por índice', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const a = await createStatus(db, { name: 'A', color: '#111111', category: 'backlog' });
      const b = await createStatus(db, { name: 'B', color: '#222222', category: 'backlog' });
      const out = await reorderStatuses(db, [b.id, a.id]);
      const posB = out.find((s) => s.id === b.id)!.position;
      const posA = out.find((s) => s.id === a.id)!.position;
      expect(posB).toBeLessThan(posA);
   });
});
