import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import {
   createTemplate,
   listTemplatesByTeam,
   updateTemplate,
   deleteTemplate,
} from '@/lib/api/templates';
import { ApiError } from '@/lib/api/errors';

describe('issue templates', () => {
   it('CRUD completo por time', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');

      const t = await createTemplate(db, {
         teamId: 'CORE',
         name: 'Bug report',
         title: '[Bug] ',
         description: 'Passos para reproduzir:',
         statusId: 'to-do',
         priorityId: 'high',
      });
      expect(t.id).toBeTruthy();
      expect(t.name).toBe('Bug report');
      expect(t.statusId).toBe('to-do');

      let list = await listTemplatesByTeam(db, 'CORE');
      expect(list).toHaveLength(1);

      const upd = await updateTemplate(db, t.id, { name: 'Bug', title: null });
      expect(upd?.name).toBe('Bug');
      expect(upd?.title).toBeNull();
      // priorityId não foi tocado no patch → preservado
      expect(upd?.priorityId).toBe('high');

      const del = await deleteTemplate(db, t.id);
      expect(del).toBe(true);
      list = await listTemplatesByTeam(db, 'CORE');
      expect(list).toHaveLength(0);
   });

   it('rejeita criar em time inexistente', async () => {
      const db = await makeTestDb();
      await expect(createTemplate(db, { teamId: 'NOPE', name: 'x' })).rejects.toThrow(ApiError);
   });

   it('update/delete de template inexistente retornam null/false', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      expect(await updateTemplate(db, 'missing', { name: 'y' })).toBeNull();
      expect(await deleteTemplate(db, 'missing')).toBe(false);
   });
});
