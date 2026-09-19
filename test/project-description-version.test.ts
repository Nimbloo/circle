import { describe, expect, it } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { ApiError } from '@/lib/api/errors';
import { createProject } from '@/lib/api/projects';
import { getProjectDetail, updateProjectDetail } from '@/lib/api/project-detail';
import type { EditorDoc } from '@/lib/editor-doc';

const doc = (text: string): EditorDoc => ({
   type: 'doc',
   content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function aProject() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const project = await createProject(db, {
      name: 'P',
      statusId: 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
      teamId: 'CORE',
   });
   return { db, id: project.id };
}

/** Descrição do projeto com concorrência otimista (#18), igual à da issue. */
describe('descrição do projeto com descriptionVersion (#18)', () => {
   it('versão confere → grava e devolve a versão nova', async () => {
      const { db, id } = await aProject();
      const antes = (await getProjectDetail(db, id))!;
      expect(antes.descriptionVersion).toBeTruthy();
      const dto = await updateProjectDetail(db, id, {
         descriptionDoc: doc('meu'),
         expectedDescriptionVersion: antes.descriptionVersion,
      });
      expect(dto?.descriptionVersion).not.toBe(antes.descriptionVersion);
      expect(dto?.descriptionDoc).toEqual(doc('meu'));
   });

   it('versão divergente → 409 e nada é gravado', async () => {
      const { db, id } = await aProject();
      const antes = (await getProjectDetail(db, id))!;
      await updateProjectDetail(db, id, { descriptionDoc: doc('outra pessoa') });
      const err = await updateProjectDetail(db, id, {
         descriptionDoc: doc('meu'),
         expectedDescriptionVersion: antes.descriptionVersion,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((await getProjectDetail(db, id))!.descriptionDoc).toEqual(doc('outra pessoa'));
   });

   it('summary não conflita com a versão da descrição; sem o campo é last-write-wins', async () => {
      const { db, id } = await aProject();
      const antes = (await getProjectDetail(db, id))!;
      await updateProjectDetail(db, id, { summary: 'resumo' });
      await updateProjectDetail(db, id, {
         descriptionDoc: doc('meu'),
         expectedDescriptionVersion: antes.descriptionVersion,
      });
      await updateProjectDetail(db, id, { descriptionDoc: doc('sem versão') });
      expect((await getProjectDetail(db, id))!.descriptionDoc).toEqual(doc('sem versão'));
   });
});
