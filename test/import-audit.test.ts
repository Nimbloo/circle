import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/db';
import { label as labelT } from '@/db/schema';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { commitImport } from '@/lib/api/import';
import { listIssues } from '@/lib/api/issues';

/** Auditoria de import (integridade, escopo e validação de input). */
const ADMIN = 'admin@circle.dev';
const MEMBER = 'member@circle.dev';
let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Admin', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Member', email: MEMBER, teamIds: ['CORE'] });
});

describe('import: escopo', () => {
   it('não-admin não cria labels no catálogo pelo import (criar label é só admin)', async () => {
      const csv = 'ID,Title,Labels\nX-1,Nova,Plataforma';
      const mapping = { externalId: 'ID', title: 'Title', labels: 'Labels' };
      await expect(
         commitImport(
            db,
            { source: 'csv', csv, mapping, teamId: 'CORE', createMissingLabels: true },
            MEMBER
         )
      ).rejects.toMatchObject({ status: 403 });
      const labels = await db.select().from(labelT);
      expect(labels.map((l) => l.id)).not.toContain('plataforma');
      expect(await listIssues(db, { team: 'CORE' })).toHaveLength(0);

      const ok = await commitImport(
         db,
         { source: 'csv', csv, mapping, teamId: 'CORE', createMissingLabels: true },
         ADMIN
      );
      expect(ok.created).toBe(1);
   });
});
