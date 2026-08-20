import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { seedDemo } from '@/db/seed-demo';
import { appUser, team, project, issue } from '@/db/schema';
import { listIssues } from '@/lib/api/issues';
import { listProjects } from '@/lib/api/projects';
import type { Db } from '@/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(db: Db, table: any): Promise<number> {
   const rows = await db.select().from(table);
   return rows.length;
}

describe('demo seed', () => {
   it('is a safe no-op when mock-data is empty (app is API-driven, mocks zeroed)', async () => {
      const db = await makeTestDb();
      await expect(seedDemo(db)).resolves.toBeUndefined();
      expect(await count(db, appUser)).toBe(0);
      expect(await count(db, team)).toBe(0);
      expect(await count(db, project)).toBe(0);
      expect(await count(db, issue)).toBe(0);
   });

   it('remains a no-op when re-run (idempotent)', async () => {
      const db = await makeTestDb();
      await seedDemo(db);
      await seedDemo(db);
      expect(await count(db, issue)).toBe(0);
   });
});

describe('workspace fixture (relational integrity)', () => {
   it('resolved issues/projects have nested relations and can be listed/filtered', async () => {
      const db = await makeTestDb();
      await seedWorkspaceFixture(db);

      const all = await listIssues(db);
      expect(all.length).toBe(1);
      expect(all[0].status.id).toBeTruthy();
      expect(all[0].priority.id).toBeTruthy();
      expect(all[0].project?.id).toBe('P-1');

      const started = await listIssues(db, { statusType: ['started'] });
      expect(started.length).toBe(1);

      const projs = await listProjects(db, { tab: 'all' });
      expect(projs.length).toBe(1);
      expect(projs.every((p) => p.status && p.priority && p.health)).toBe(true);
   });
});
