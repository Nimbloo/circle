import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { initiative } from '@/db/schema';
import { postInitiativeUpdate, listInitiativeUpdates } from '@/lib/api/initiative-detail';

describe('initiative updates (paridade Linear)', () => {
   it('postar update propaga health pra initiative + aparece no feed', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);

      const [before] = await db.select().from(initiative).where(eq(initiative.id, fx.initiativeId));
      expect(before.healthId).toBe('on-track'); // fixture

      await postInitiativeUpdate(db, fx.initiativeId, fx.ownerId, {
         health: 'off-track',
         blocks: [{ type: 'paragraph', text: 'atrasou' }],
      });

      const [after] = await db.select().from(initiative).where(eq(initiative.id, fx.initiativeId));
      expect(after.healthId).toBe('off-track'); // veio do último update

      const feed = await listInitiativeUpdates(db, fx.initiativeId);
      expect(feed).toHaveLength(1);
      expect(feed[0].health).toBe('off-track');
      expect(feed[0].author?.id).toBe(fx.ownerId);
   });

   it('rejeita health inválido e initiative inexistente', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      await expect(
         // @ts-expect-error health inválido
         postInitiativeUpdate(db, fx.initiativeId, fx.ownerId, { health: 'bogus' })
      ).rejects.toThrow();
      await expect(
         postInitiativeUpdate(db, 'nope', fx.ownerId, { health: 'on-track' })
      ).rejects.toThrow();
   });
});
