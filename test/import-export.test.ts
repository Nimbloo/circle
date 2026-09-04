import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import {
   commitImport,
   csvToObjects,
   parseCsv,
   previewImport,
   suggestMapping,
} from '@/lib/api/import';
import { exportIssuesJson } from '@/lib/api/export';
import { listIssues } from '@/lib/api/issues';

const ACTOR = 'owner@circle.dev';

const LINEAR_CSV = [
   'ID,Title,Description,Status,Estimate,Priority,Assignee,Labels,Due Date,Parent issue',
   'LIN-1,Corrigir login,"Erro 500, intermitente",In Progress,3,Urgent,owner@circle.dev,Bug,2026-10-01,',
   'LIN-2,Ajustar tela,,Todo,,Medium,,"Bug; Design",,LIN-1',
].join('\n');

const JIRA_CSV = [
   'Issue key,Summary,Description,Status,Priority,Assignee,Labels,Story Points,Due Date',
   'PROJ-9,Migrar banco,Detalhes,Done,Highest,Owner,infra,5,2026-11-02',
].join('\n');

describe('import/export de issues (#101)', () => {
   let db: Db;

   beforeEach(async () => {
      db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Owner', email: ACTOR, teamIds: ['CORE'] });
   });

   it('parseia CSV com aspas, vírgula interna e CRLF', () => {
      const rows = parseCsv('a,b\r\n"x,1","dois ""aspas"""\r\n');
      expect(rows).toEqual([
         ['a', 'b'],
         ['x,1', 'dois "aspas"'],
      ]);
   });

   it('csvToObjects usa o cabeçalho e ignora linhas vazias', () => {
      const { columns, rows } = csvToObjects('a,b\n1,2\n\n3,4\n');
      expect(columns).toEqual(['a', 'b']);
      expect(rows).toEqual([
         { a: '1', b: '2' },
         { a: '3', b: '4' },
      ]);
   });

   it('propõe mapeamento pelos presets do Linear e do Jira', () => {
      const linear = suggestMapping('linear', LINEAR_CSV.split('\n')[0].split(','));
      expect(linear.title).toBe('Title');
      expect(linear.externalId).toBe('ID');
      expect(linear.parent).toBe('Parent issue');

      const jira = suggestMapping('jira', JIRA_CSV.split('\n')[0].split(','));
      expect(jira.externalId).toBe('Issue key');
      expect(jira.title).toBe('Summary');
      expect(jira.estimate).toBe('Story Points');
   });

   it('preview resolve status/prioridade/assignee/labels e avisa o que não casou', async () => {
      const preview = await previewImport(db, { source: 'linear', csv: LINEAR_CSV });

      expect(preview.totalRows).toBe(2);
      expect(preview.sample).toHaveLength(2);

      const first = preview.sample[0];
      expect(first.externalId).toBe('LIN-1');
      expect(first.statusId).toBe('in-progress');
      expect(first.priorityId).toBe('urgent');
      expect(first.assigneeId).toBeTruthy();
      expect(first.labels).toEqual([{ name: 'Bug', labelId: 'bug' }]);
      expect(first.dueDate).toBe('2026-10-01');
      expect(first.estimate).toBe(3);
      expect(first.existing).toBe(false);

      const second = preview.sample[1];
      expect(second.parentExternalId).toBe('LIN-1');
      expect(second.labels.map((l) => l.labelId)).toEqual(['bug', 'design']);
   });

   it('preview traduz os sinônimos de prioridade do Jira', async () => {
      const preview = await previewImport(db, { source: 'jira', csv: JIRA_CSV });
      expect(preview.sample[0].priorityId).toBe('urgent'); // Highest → Urgent
      expect(preview.sample[0].statusId).toBe('done');
      expect(preview.sample[0].estimate).toBe(5);
   });

   it('commit cria as issues, liga o pai e é idempotente no re-import', async () => {
      const mapping = suggestMapping('linear', LINEAR_CSV.split('\n')[0].split(','));
      const first = await commitImport(
         db,
         { source: 'linear', csv: LINEAR_CSV, mapping, teamId: 'CORE' },
         ACTOR
      );
      expect(first.created).toBe(2);
      expect(first.updated).toBe(0);
      expect(first.errors).toEqual([]);

      const issues = await listIssues(db, { team: 'CORE' });
      expect(issues).toHaveLength(2);
      const child = issues.find((i) => i.title === 'Ajustar tela')!;
      const parent = issues.find((i) => i.title === 'Corrigir login')!;
      expect(child.parentId).toBe(parent.id);
      expect(parent.labels.map((l) => l.id)).toEqual(['bug']);
      expect(parent.dueDate).toBe('2026-10-01');

      // Re-import do MESMO arquivo com o título alterado: atualiza, não duplica.
      const changed = LINEAR_CSV.replace('Corrigir login', 'Corrigir login (v2)');
      const second = await commitImport(
         db,
         { source: 'linear', csv: changed, mapping, teamId: 'CORE' },
         ACTOR
      );
      expect(second.created).toBe(0);
      expect(second.updated).toBe(2);

      const after = await listIssues(db, { team: 'CORE' });
      expect(after).toHaveLength(2);
      expect(after.map((i) => i.title).sort()).toEqual(['Ajustar tela', 'Corrigir login (v2)']);
   });

   it('preview marca como existente o que já foi importado', async () => {
      const mapping = suggestMapping('linear', LINEAR_CSV.split('\n')[0].split(','));
      await commitImport(db, { source: 'linear', csv: LINEAR_CSV, mapping, teamId: 'CORE' }, ACTOR);
      const preview = await previewImport(db, { source: 'linear', csv: LINEAR_CSV });
      expect(preview.sample.every((r) => r.existing)).toBe(true);
   });

   it('cria labels ausentes só quando pedido', async () => {
      const csv = 'ID,Title,Labels\nX-1,Nova,Plataforma';
      const mapping = suggestMapping('csv', ['ID', 'Title', 'Labels']);

      await commitImport(db, { source: 'csv', csv, mapping, teamId: 'CORE' }, ACTOR);
      expect((await listIssues(db, { team: 'CORE' }))[0].labels).toEqual([]);

      const csv2 = 'ID,Title,Labels\nX-2,Outra,Plataforma';
      await commitImport(
         db,
         { source: 'csv', csv: csv2, mapping, teamId: 'CORE', createMissingLabels: true },
         ACTOR
      );
      const created = (await listIssues(db, { team: 'CORE' })).find((i) => i.title === 'Outra')!;
      expect(created.labels.map((l) => l.id)).toEqual(['plataforma']);
   });

   it('ignora linhas sem título em vez de abortar o lote', async () => {
      const csv = 'ID,Title\nA-1,Com título\nA-2,\nA-3,Outra';
      const mapping = suggestMapping('csv', ['ID', 'Title']);
      const result = await commitImport(db, { source: 'csv', csv, mapping, teamId: 'CORE' }, ACTOR);
      expect(result.created).toBe(2);
      expect(result.skipped).toBe(1);
   });

   it('export JSON traz labels, responsáveis, pai e comentários', async () => {
      const mapping = suggestMapping('linear', LINEAR_CSV.split('\n')[0].split(','));
      await commitImport(db, { source: 'linear', csv: LINEAR_CSV, mapping, teamId: 'CORE' }, ACTOR);

      const bundle = await exportIssuesJson(db, { team: 'CORE' });
      expect(bundle.version).toBe(1);
      expect(bundle.count).toBe(2);

      const parent = bundle.issues.find((i) => i.title === 'Corrigir login')!;
      expect(parent.description).toBe('Erro 500, intermitente');
      expect(parent.labels.map((l) => l.id)).toEqual(['bug']);
      expect(parent.assignees.map((a) => a.email)).toEqual([ACTOR]);
      expect(parent.comments).toEqual([]);

      const child = bundle.issues.find((i) => i.title === 'Ajustar tela')!;
      expect(child.parent?.identifier).toBe(parent.identifier);
   });
});
