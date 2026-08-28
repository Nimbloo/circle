import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import {
   createProjectTemplate,
   listProjectTemplatesByTeam,
   updateProjectTemplate,
   deleteProjectTemplate,
} from '@/lib/api/project-templates';
import { ApiError } from '@/lib/api/errors';

describe('project templates', () => {
   it('CRUD completo por time', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');

      const t = await createProjectTemplate(db, {
         teamId: 'CORE',
         name: 'Novo serviço',
         projectName: 'serviço-',
         statusId: 'proj-planned',
         priorityId: 'high',
      });
      expect(t.id).toBeTruthy();
      expect(t.name).toBe('Novo serviço');
      expect(t.projectName).toBe('serviço-');

      let list = await listProjectTemplatesByTeam(db, 'CORE');
      expect(list).toHaveLength(1);

      const upd = await updateProjectTemplate(db, t.id, { name: 'Serviço', projectName: null });
      expect(upd?.name).toBe('Serviço');
      expect(upd?.projectName).toBeNull();
      expect(upd?.statusId).toBe('proj-planned'); // preservado

      expect(await deleteProjectTemplate(db, t.id)).toBe(true);
      list = await listProjectTemplatesByTeam(db, 'CORE');
      expect(list).toHaveLength(0);
   });

   it('rejeita time inexistente', async () => {
      const db = await makeTestDb();
      await expect(createProjectTemplate(db, { teamId: 'NOPE', name: 'x' })).rejects.toThrow(
         ApiError
      );
   });
});
