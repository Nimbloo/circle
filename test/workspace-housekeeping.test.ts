import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/project-snapshots', () => ({
   snapshotProjects: vi.fn().mockRejectedValue(new Error('snapshot failed')),
}));

import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { bootstrapWorkspace } from '@/lib/api/workspace';
import { snapshotProjects } from '@/lib/api/project-snapshots';

describe('workspace housekeeping', () => {
   it('libera a claim de snapshot quando a execução falha', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);

      await expect(bootstrapWorkspace(db, fx.ownerEmail)).rejects.toThrow('snapshot failed');
      await expect(bootstrapWorkspace(db, fx.ownerEmail)).rejects.toThrow('snapshot failed');

      expect(snapshotProjects).toHaveBeenCalledTimes(2);
   });
});
