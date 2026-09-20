import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { recordAudit, listAudit } from '@/lib/api/audit';

/**
 * Ad#22 — `automation.run` é gravado a cada regra disparada e empurrava as ações de
 * admin para fora do limite da listagem. A tela de audit lista só as ações de admin.
 */
describe('listAudit (Ad#22)', () => {
   it('automation.run não ocupa o limite das ações administrativas', async () => {
      const db = await makeTestDb();
      const ana = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await recordAudit(db, { actorId: ana, action: 'team.create', targetType: 'team' });
      for (let i = 0; i < 3; i++) {
         await recordAudit(db, { actorId: ana, action: 'automation.run', targetType: 'issue' });
      }

      const log = await listAudit(db, 2);
      expect(log.map((e) => e.action)).toEqual(['team.create']);
   });
});
