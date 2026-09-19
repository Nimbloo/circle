import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { createView, resolveView } from '@/lib/api/views';

/** Ad#30 — `/views/:id/results` parava em 500 issues sem avisar que estava incompleto. */
const ME = 'dev@nimbloo.ai';

describe('resolveView sinaliza truncamento (Ad#30)', () => {
   it('marca truncated quando há mais issues que o limite', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Dev', email: ME, teamIds: ['CORE'] });
      for (const title of ['A', 'B', 'C']) {
         await createIssue(db, { teamId: 'CORE', title, statusId: 'to-do', priorityId: 'low' }, ME);
      }
      const view = await createView(
         db,
         { slug: 'all', name: 'Todas', type: 'issue', filter: {} },
         ME
      );

      const cut = await resolveView(db, view.id, undefined, undefined, 2);
      expect(cut?.issues).toHaveLength(2);
      expect(cut?.truncated).toBe(true);

      const full = await resolveView(db, view.id, undefined, undefined, 3);
      expect(full?.issues).toHaveLength(3);
      expect(full?.truncated).toBe(false);
   });
});
