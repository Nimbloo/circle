import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { initiative, project } from '@/db/schema';
import {
   deleteProjectUpdate,
   editProjectUpdate,
   listUpdates,
   postProjectUpdate,
} from '@/lib/api/project-detail';
import {
   deleteInitiativeUpdate,
   editInitiativeUpdate,
   listInitiativeUpdates,
   postInitiativeUpdate,
} from '@/lib/api/initiative-detail';

const text = (t: string) => [{ type: 'paragraph' as const, text: t }];
const healthOf = async (db: Awaited<ReturnType<typeof makeTestDb>>, id: string) =>
   (await db.select().from(project).where(eq(project.id, id)))[0].healthId;

/** pl#11: updates de projeto e de initiative editáveis, apagáveis e nunca vazios. */
describe('updates de projeto (pl#11)', () => {
   it('recusa update sem conteúdo', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      await expect(
         postProjectUpdate(db, fx.projectId, fx.ownerId, { health: 'on-track', blocks: [] })
      ).rejects.toMatchObject({ status: 400 });
      await expect(
         postProjectUpdate(db, fx.projectId, fx.ownerId, {
            health: 'on-track',
            blocks: text('   '),
         })
      ).rejects.toMatchObject({ status: 400 });
   });

   it('editar o último update troca o texto e repropaga o health', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const posted = await postProjectUpdate(db, fx.projectId, fx.ownerId, {
         health: 'off-track',
         blocks: text('atrasou'),
      });

      const edited = await editProjectUpdate(db, fx.projectId, posted.id, {
         health: 'at-risk',
         blocks: text('melhorou'),
      });
      expect(edited.health).toBe('at-risk');
      expect(edited.blocks).toEqual(text('melhorou'));
      expect(await healthOf(db, fx.projectId)).toBe('at-risk');

      await expect(
         editProjectUpdate(db, fx.projectId, posted.id, { blocks: [] })
      ).rejects.toMatchObject({ status: 400 });
   });

   it('excluir o último update volta o health para o update anterior', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      await postProjectUpdate(db, fx.projectId, fx.ownerId, {
         health: 'on-track',
         blocks: text('primeiro'),
      });
      const second = await postProjectUpdate(db, fx.projectId, fx.ownerId, {
         health: 'off-track',
         blocks: text('segundo'),
      });
      expect(await healthOf(db, fx.projectId)).toBe('off-track');

      expect(await deleteProjectUpdate(db, fx.projectId, second.id)).toBe(true);
      expect(await healthOf(db, fx.projectId)).toBe('on-track');
      expect(await listUpdates(db, fx.projectId)).toHaveLength(1);
   });

   it('sem updates o health volta para no-update', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const only = await postProjectUpdate(db, fx.projectId, fx.ownerId, {
         health: 'off-track',
         blocks: text('único'),
      });
      await deleteProjectUpdate(db, fx.projectId, only.id);
      expect(await healthOf(db, fx.projectId)).toBe('no-update');
   });

   it('update inexistente não apaga nada', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      expect(await deleteProjectUpdate(db, fx.projectId, 'nope')).toBe(false);
   });
});

describe('updates de initiative (pl#11)', () => {
   it('recusa update vazio, edita e exclui com health repropagado', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      await expect(
         postInitiativeUpdate(db, fx.initiativeId, fx.ownerId, {
            health: 'on-track',
            blocks: [],
         })
      ).rejects.toMatchObject({ status: 400 });

      const { update } = await postInitiativeUpdate(db, fx.initiativeId, fx.ownerId, {
         health: 'off-track',
         blocks: text('atrasou'),
      });
      const edited = await editInitiativeUpdate(db, fx.initiativeId, update.id, {
         health: 'at-risk',
         blocks: text('melhorou'),
      });
      expect(edited.update.health).toBe('at-risk');
      expect(edited.initiative.health.id).toBe('at-risk');

      expect(await deleteInitiativeUpdate(db, fx.initiativeId, update.id)).not.toBeNull();
      expect(await listInitiativeUpdates(db, fx.initiativeId)).toHaveLength(0);
      const [row] = await db.select().from(initiative).where(eq(initiative.id, fx.initiativeId));
      expect(row.healthId).toBe('no-update');
   });
});
