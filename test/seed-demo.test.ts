import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedDemo } from '@/db/seed-demo';
import {
   appUser,
   team,
   project,
   issue,
   cycle,
   initiative,
   savedView,
   teamMember,
   issueLabel,
} from '@/db/schema';
import { listIssues } from '@/lib/api/issues';
import { listProjects } from '@/lib/api/projects';
import type { Db } from '@/db';

import { users as mockUsers } from '@/mock-data/users';
import { teams as mockTeams } from '@/mock-data/teams';
import { projects as mockProjects } from '@/mock-data/projects';
import { issues as mockIssues } from '@/mock-data/issues';
import { cycles as mockCycles } from '@/mock-data/cycles';
import { initiatives as mockInitiatives } from '@/mock-data/initiatives';
import { views as mockViews } from '@/mock-data/views';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(db: Db, table: any): Promise<number> {
   const rows = await db.select().from(table);
   return rows.length;
}

describe('demo seed (mock-data -> DB)', () => {
   it('seeds every core entity matching the mock array sizes', async () => {
      const db = await makeTestDb();
      await seedDemo(db);

      expect(await count(db, appUser)).toBe(mockUsers.length);
      expect(await count(db, team)).toBe(mockTeams.length);
      expect(await count(db, project)).toBe(mockProjects.length);
      expect(await count(db, issue)).toBe(mockIssues.length);
      expect(await count(db, cycle)).toBe(mockCycles.length);
      expect(await count(db, initiative)).toBe(mockInitiatives.length);
      expect(await count(db, savedView)).toBe(mockViews.length);
      expect(await count(db, teamMember)).toBeGreaterThan(0);
      expect(await count(db, issueLabel)).toBeGreaterThan(0);
   });

   it('is idempotent (re-running does not duplicate)', async () => {
      const db = await makeTestDb();
      await seedDemo(db);
      await seedDemo(db);
      expect(await count(db, issue)).toBe(mockIssues.length);
   });

   it('resolved issues/projects have nested relations and can be listed/filtered', async () => {
      const db = await makeTestDb();
      await seedDemo(db);
      const all = await listIssues(db);
      expect(all.length).toBe(mockIssues.length);
      expect(all[0].status.id).toBeTruthy();
      expect(all[0].priority.id).toBeTruthy();
      const started = await listIssues(db, { statusType: ['started'] });
      expect(started.length).toBeGreaterThan(0);
      const projs = await listProjects(db);
      expect(projs.length).toBe(mockProjects.length);
      expect(projs.every((p) => p.status && p.priority && p.health)).toBe(true);
   });
});
