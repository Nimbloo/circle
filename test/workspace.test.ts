import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { bootstrapWorkspace } from '@/lib/api/workspace';

describe('workspace bootstrap', () => {
   it('returns all reference data stitched (teams with members+projects, cycles, etc.)', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const ws = await bootstrapWorkspace(db, fx.ownerEmail);

      expect(ws.statuses.length).toBe(13);
      expect(ws.teams.length).toBeGreaterThan(0);
      expect(ws.projects.length).toBeGreaterThan(0);
      expect(ws.members.length).toBeGreaterThan(0);
      expect(ws.cycles.length).toBeGreaterThan(0);
      expect(ws.initiatives.length).toBeGreaterThan(0);
      expect(ws.views.length).toBeGreaterThan(0);

      // o usuário corrente é resolvido pelo email
      expect(ws.me.email).toBe(fx.ownerEmail);

      // times vêm costurados com members e projects
      const core = ws.teams.find((t) => t.id === 'CORE');
      expect(core).toBeTruthy();
      expect(core!.members.length).toBeGreaterThan(0);
      expect(core!.projects.every((p) => p.teamId === 'CORE')).toBe(true);
   });
});
