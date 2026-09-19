import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { exportIssueRows, exportIssuesJson } from '@/lib/api/export';

/** Ad#21–40: export parava em 5000 em silêncio — o arquivo parecia completo. */
describe('export avisa quando trunca', () => {
   it('marca truncated quando há mais issues que o limite', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
      for (const t of ['a', 'b', 'c'])
         await createIssue(
            db,
            { teamId: 'CORE', title: t, statusId: 'to-do', priorityId: 'medium' },
            'ana@nimbloo.ai'
         );

      const cheio = await exportIssueRows(db, { team: 'CORE' }, 2);
      expect(cheio.issues).toHaveLength(2);
      expect(cheio.truncated).toBe(true);

      const ok = await exportIssueRows(db, { team: 'CORE' }, 3);
      expect(ok.truncated).toBe(false);

      const bundle = await exportIssuesJson(db, { team: 'CORE' });
      expect(bundle.truncated).toBe(false);
      expect(bundle.count).toBe(3);
   });
});
