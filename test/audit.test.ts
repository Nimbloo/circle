import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { recordAudit, listAudit } from '@/lib/api/audit';

describe('audit log', () => {
   it('registra e lista com o ator resolvido, mais recente primeiro', async () => {
      const db = await makeTestDb();
      const ana = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });

      await recordAudit(db, {
         actorId: ana,
         action: 'team.create',
         targetType: 'team',
         targetId: 'CORE',
         meta: { name: 'Core' },
      });
      await recordAudit(db, {
         actorId: ana,
         action: 'role.change',
         targetType: 'member',
         targetId: 'u1',
         meta: { role: 'Admin' },
      });

      const log = await listAudit(db);
      expect(log).toHaveLength(2);
      expect(log[0].action).toBe('role.change'); // mais recente primeiro
      expect(log[0].actor?.email).toBe('ana@nimbloo.ai');
      expect(log[0].meta).toEqual({ role: 'Admin' });
   });

   it('nunca lança (best-effort) e tolera ator nulo', async () => {
      const db = await makeTestDb();
      await expect(recordAudit(db, { action: 'system.event' })).resolves.toBeUndefined();
      const log = await listAudit(db);
      expect(log[0].actor).toBeNull();
   });
});
