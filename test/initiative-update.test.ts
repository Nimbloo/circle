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

      const { update, initiative: dto } = await postInitiativeUpdate(
         db,
         fx.initiativeId,
         fx.ownerId,
         {
            health: 'off-track',
            blocks: [{ type: 'paragraph', text: 'atrasou' }],
         }
      );
      // Devolve o update E a initiative já com o health propagado (o cliente aplica no
      // store sem re-hidratar o workspace).
      expect(update.health).toBe('off-track');
      expect(update.author?.id).toBe(fx.ownerId);
      expect(dto.id).toBe(fx.initiativeId);
      expect(dto.health.id).toBe('off-track');

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

describe('feeds de initiative com limite (Pl baixa)', () => {
   it('updates e activity da initiative devolvem no máximo o limite do feed', async () => {
      const { initiativeUpdate, initiativeActivity } = await import('@/db/schema');
      const { listInitiativeActivity } = await import('@/lib/api/initiatives');
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const rows = Array.from({ length: 105 }, (_, i) => ({
         id: `u${i}`,
         initiativeId: fx.initiativeId,
         authorId: fx.ownerId,
         health: 'on-track',
         blocks: '[]',
         createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      }));
      await db.insert(initiativeUpdate).values(rows);
      await db.insert(initiativeActivity).values(
         rows.map((r) => ({
            id: r.id,
            initiativeId: r.initiativeId,
            userId: r.authorId,
            text: 'changed status',
            createdAt: r.createdAt,
         }))
      );

      const feed = await listInitiativeUpdates(db, fx.initiativeId);
      expect(feed).toHaveLength(100);
      expect(feed[0].id).toBe('u104'); // mais recente primeiro
      expect(await listInitiativeActivity(db, fx.initiativeId)).toHaveLength(100);
   });
});
