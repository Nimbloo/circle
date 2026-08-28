import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { project } from '@/db/schema';
import { postProjectUpdate } from '@/lib/api/project-detail';

describe('project update propaga health (#25 paridade Linear)', () => {
   it('postar update seta project.healthId + healthUpdatedAt', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);

      const [before] = await db.select().from(project).where(eq(project.id, fx.projectId));
      expect(before.healthId).toBe('on-track'); // valor do fixture

      await postProjectUpdate(db, fx.projectId, fx.ownerId, { health: 'off-track', blocks: [] });

      const [after] = await db.select().from(project).where(eq(project.id, fx.projectId));
      expect(after.healthId).toBe('off-track'); // veio do último update
      expect(after.healthUpdatedAt).not.toBeNull();
   });
});
