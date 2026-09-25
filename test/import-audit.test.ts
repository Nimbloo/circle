import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/db';
import { label as labelT } from '@/db/schema';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { commitImport, previewImport } from '@/lib/api/import';
import { listIssues } from '@/lib/api/issues';

/** Auditoria de import (integridade, escopo e validação de input). */
const ADMIN = 'admin@circle.dev';
const MEMBER = 'member@circle.dev';
let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Admin', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Member', email: MEMBER, teamIds: ['CORE'] });
});

describe('import: escopo', () => {
   it('não-admin não cria labels no catálogo pelo import (criar label é só admin)', async () => {
      const csv = 'ID,Title,Labels\nX-1,Nova,Plataforma';
      const mapping = { externalId: 'ID', title: 'Title', labels: 'Labels' };
      await expect(
         commitImport(
            db,
            { source: 'csv', csv, mapping, teamId: 'CORE', createMissingLabels: true },
            MEMBER
         )
      ).rejects.toMatchObject({ status: 403 });
      const labels = await db.select().from(labelT);
      expect(labels.map((l) => l.id)).not.toContain('plataforma');
      expect(await listIssues(db, { team: 'CORE' })).toHaveLength(0);

      const ok = await commitImport(
         db,
         { source: 'csv', csv, mapping, teamId: 'CORE', createMissingLabels: true },
         ADMIN
      );
      expect(ok.created).toBe(1);
   });
});

describe('import: CSV malformado', () => {
   it('aspas sem fechar recusam o arquivo em vez de engolir as linhas seguintes', async () => {
      const csv = 'ID,Title\nA-1,"Aberta\nA-2,Outra\nA-3,Mais uma';
      const mapping = { externalId: 'ID', title: 'Title' };
      await expect(previewImport(db, { source: 'csv', csv })).rejects.toMatchObject({
         status: 400,
      });
      await expect(
         commitImport(db, { source: 'csv', csv, mapping, teamId: 'CORE' }, ADMIN)
      ).rejects.toMatchObject({ status: 400 });
      expect(await listIssues(db, { team: 'CORE' })).toHaveLength(0);
   });

   it('mapeamento para coluna inexistente é 400, não um lote "concluído" com tudo ignorado', async () => {
      const csv = 'ID,Title\nA-1,Uma';
      await expect(
         commitImport(db, { source: 'csv', csv, mapping: { title: 'Nome' }, teamId: 'CORE' }, ADMIN)
      ).rejects.toMatchObject({ status: 400 });
   });
});

describe('import: integridade', () => {
   it('externalId acima de 128 chars é recusado antes de criar a issue', async () => {
      const csv = `ID,Title\n${'X'.repeat(129)},Longa`;
      const mapping = { externalId: 'ID', title: 'Title' };
      const run = () => commitImport(db, { source: 'csv', csv, mapping, teamId: 'CORE' }, ADMIN);
      // Antes: a issue nascia, o `issue_import` estourava o varchar(128) e cada re-import
      // criava mais uma cópia (sem rastro, não havia como achar a existente).
      await expect(run()).rejects.toMatchObject({ status: 400 });
      await expect(run()).rejects.toMatchObject({ status: 400 });
      expect(await listIssues(db, { team: 'CORE' })).toHaveLength(0);
   });
});

async function dueOf(raw: string): Promise<string | null> {
   const csv = `Title,Due Date\nT,"${raw}"`;
   const preview = await previewImport(db, { source: 'csv', csv });
   return preview.sample[0].dueDate;
}

describe('import: datas', () => {
   it('data com hora vira o dia escrito no arquivo, independente do fuso do servidor', async () => {
      // Antes: `toISOString()` convertia para UTC — 23h em UTC-3 virava o dia seguinte.
      expect(await dueOf('Mar 15, 2024 11:00 PM')).toBe('2024-03-15');
      expect(await dueOf('15/Mar/24 11:30 PM')).toBe('2024-03-15');
   });

   it('dd/MM/yyyy é lido como dia/mês (não como o MM/dd americano)', async () => {
      // Antes: 03/04/2024 virava 4 de março e 15/03/2024 era "não reconhecida".
      expect(await dueOf('03/04/2024')).toBe('2024-04-03');
      expect(await dueOf('15/03/2024')).toBe('2024-03-15');
      expect(await dueOf('31/02/2024')).toBeNull();
   });
});
