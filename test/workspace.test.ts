import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedDemo } from '@/db/seed-demo';
import { bootstrapWorkspace } from '@/lib/api/workspace';

describe('workspace bootstrap', () => {
   it('returns all reference data stitched (teams with members+projects, cycles, etc.)', async () => {
      const db = await makeTestDb();
      await seedDemo(db);
      const ws = await bootstrapWorkspace(db, 'ln@example.com');

      expect(ws.statuses.length).toBe(13);
      expect(ws.teams.length).toBeGreaterThan(0);
      expect(ws.projects.length).toBeGreaterThan(0);
      expect(ws.members.length).toBeGreaterThan(0);
      expect(ws.cycles.length).toBeGreaterThan(0);
      expect(ws.initiatives.length).toBeGreaterThan(0);
      expect(ws.views.length).toBeGreaterThan(0);

      // times vêm costurados com members e projects
      const core = ws.teams.find((t) => t.id === 'CORE');
      expect(core).toBeTruthy();
      expect(core!.members.length).toBeGreaterThan(0);
      expect(core!.projects.every((p) => p.teamId === 'CORE')).toBe(true);
   });
});
