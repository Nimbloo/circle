import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedUser, seedWorkspaceFixture } from './helpers/fixtures';
import { initiativeUpdate, initiative, project, projectUpdate } from '@/db/schema';
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

   it('só o autor ou um admin pode editar/excluir; outro membro recebe 403', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const outsiderEmail = 'bea.rocha@nimbloo.ai';
      await seedUser(db, { name: 'Bea Rocha', email: outsiderEmail, teamIds: [fx.teamId] });

      // fx.memberId (Lia) é o autor; fx.ownerId (Ana) é Admin.
      const posted = await postProjectUpdate(db, fx.projectId, fx.memberId, {
         health: 'on-track',
         blocks: text('do membro'),
      });

      await expect(
         editProjectUpdate(db, fx.projectId, posted.id, { blocks: text('hack') }, outsiderEmail)
      ).rejects.toMatchObject({ status: 403 });
      await expect(
         deleteProjectUpdate(db, fx.projectId, posted.id, outsiderEmail)
      ).rejects.toMatchObject({ status: 403 });

      // O próprio autor edita sem problema.
      const editedByAuthor = await editProjectUpdate(
         db,
         fx.projectId,
         posted.id,
         { blocks: text('editado pelo autor') },
         'lia.costa@nimbloo.ai'
      );
      expect(editedByAuthor.blocks).toEqual(text('editado pelo autor'));

      // Admin (não é o autor) também pode editar e excluir.
      const editedByAdmin = await editProjectUpdate(
         db,
         fx.projectId,
         posted.id,
         { blocks: text('editado pelo admin') },
         fx.ownerEmail
      );
      expect(editedByAdmin.blocks).toEqual(text('editado pelo admin'));
      expect(await deleteProjectUpdate(db, fx.projectId, posted.id, fx.ownerEmail)).toBe(true);
   });

   it('TOCTOU: editar um update já apagado por outra request é 404, não sucesso fantasma', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const posted = await postProjectUpdate(db, fx.projectId, fx.ownerId, {
         health: 'on-track',
         blocks: text('original'),
      });
      // Simula a outra request que já apagou o update entre o SELECT e o UPDATE.
      await db.delete(projectUpdate).where(eq(projectUpdate.id, posted.id));

      await expect(
         editProjectUpdate(db, fx.projectId, posted.id, { blocks: text('tarde demais') })
      ).rejects.toMatchObject({ status: 404 });
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

   it('só o autor ou um admin pode editar/excluir; outro membro recebe 403', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const outsiderEmail = 'bea.rocha@nimbloo.ai';
      await seedUser(db, { name: 'Bea Rocha', email: outsiderEmail, teamIds: [fx.teamId] });

      const { update } = await postInitiativeUpdate(db, fx.initiativeId, fx.memberId, {
         health: 'on-track',
         blocks: text('do membro'),
      });

      await expect(
         editInitiativeUpdate(
            db,
            fx.initiativeId,
            update.id,
            { blocks: text('hack') },
            outsiderEmail
         )
      ).rejects.toMatchObject({ status: 403 });
      await expect(
         deleteInitiativeUpdate(db, fx.initiativeId, update.id, outsiderEmail)
      ).rejects.toMatchObject({ status: 403 });

      const editedByAdmin = await editInitiativeUpdate(
         db,
         fx.initiativeId,
         update.id,
         { blocks: text('editado pelo admin') },
         fx.ownerEmail
      );
      expect(editedByAdmin.update.blocks).toEqual(text('editado pelo admin'));
      expect(
         await deleteInitiativeUpdate(db, fx.initiativeId, update.id, fx.ownerEmail)
      ).not.toBeNull();
   });

   it('TOCTOU: editar um update já apagado por outra request é 404, não sucesso fantasma', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const { update } = await postInitiativeUpdate(db, fx.initiativeId, fx.ownerId, {
         health: 'on-track',
         blocks: text('original'),
      });
      await db.delete(initiativeUpdate).where(eq(initiativeUpdate.id, update.id));

      await expect(
         editInitiativeUpdate(db, fx.initiativeId, update.id, { blocks: text('tarde demais') })
      ).rejects.toMatchObject({ status: 404 });
   });
});
