import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { and, eq } from 'drizzle-orm';
import { issue as issueT, issueContent } from '@/db/schema';
import { createIssue, listIssues } from '@/lib/api/issues';
import { commitImport, parseCsv, previewImport } from '@/lib/api/import';
import { GET as exportRoute } from '@/app/api/v1/issues/export/route';

/** Auditoria de import/export: o CSV do `GET /issues/export` como o Excel o abre. */
const ANA = 'ana@nimbloo.ai';
let db: Db;

function req(qs = '') {
   return new Request(`http://x/api/v1/issues/export${qs}`, {
      headers: { 'x-forwarded-email': ANA },
   });
}

async function exportCsv(): Promise<string> {
   const res = await exportRoute(req('?team=CORE'));
   expect(res.status).toBe(200);
   return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
}

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Ana', email: ANA, teamIds: ['CORE'] });
});
afterEach(() => __setTestDb(null));

describe('export CSV', () => {
   it('neutraliza injeção de fórmula (células iniciando com = + - @)', async () => {
      for (const title of ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)'])
         await createIssue(
            db,
            { teamId: 'CORE', title, statusId: 'to-do', priorityId: 'medium' },
            ANA
         );
      const rows = parseCsv((await exportCsv()).replace(/^\uFEFF/, ''));
      const titleIdx = rows[0].indexOf('title');
      const titles = rows.slice(1).map((r) => r[titleIdx]);
      expect(titles).toHaveLength(4);
      for (const t of titles) expect(t).toMatch(/^'[=+\-@]/);
   });

   it('neutraliza descrição que começa com quebra de linha seguida de fórmula', async () => {
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Com descrição',
            description: '\n=HYPERLINK("http://evil","x")',
            statusId: 'to-do',
            priorityId: 'medium',
         },
         ANA
      );
      const [header, ...rows] = parseCsv((await exportCsv()).replace(/^﻿/, ''));
      expect(rows[0][header.indexOf('description')]).toMatch(/^'\n=/);
   });

   it('o marcador anti-fórmula volta pelo import sem sujar título/descrição', async () => {
      const titles = ['=1+1', "'=já tinha aspas", "'texto com aspas", '-lista'];
      for (const title of titles)
         await createIssue(
            db,
            {
               teamId: 'CORE',
               title,
               description: title === '=1+1' ? '@menção' : null,
               statusId: 'to-do',
               priorityId: 'medium',
            },
            ANA
         );
      const csv = await exportCsv();
      const preview = await previewImport(db, { source: 'csv', csv });
      expect(preview.sample.map((r) => r.title).sort()).toEqual([...titles].sort());

      // Importa num OUTRO time (cria issues novas) e confere a descrição gravada.
      await seedTeam(db, 'COPY', 'Copy');
      await commitImport(db, { source: 'csv', csv, mapping: preview.mapping, teamId: 'COPY' }, ANA);
      const copied = await listIssues(db, { team: 'COPY' });
      expect(copied.map((i) => i.title).sort()).toEqual([...titles].sort());
      const [withDesc] = await db
         .select({ description: issueContent.description })
         .from(issueContent)
         .innerJoin(issueT, eq(issueT.id, issueContent.issueId))
         .where(and(eq(issueT.teamId, 'COPY'), eq(issueT.title, '=1+1')));
      expect(withDesc.description).toBe('@menção');
   });

   it('começa com BOM UTF-8 para o Excel abrir os acentos certos', async () => {
      await createIssue(
         db,
         { teamId: 'CORE', title: 'Revisão de ação', statusId: 'to-do', priorityId: 'medium' },
         ANA
      );
      const csv = await exportCsv();
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain('Revisão de ação');
   });

   it('leva descrição, pai, time e updatedAt — e o arquivo volta pelo import', async () => {
      const pai = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Pai',
            description: 'Linha 1, com vírgula',
            statusId: 'to-do',
            priorityId: 'medium',
         },
         ANA
      );
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Filha',
            parentId: pai.id,
            statusId: 'to-do',
            priorityId: 'medium',
         },
         ANA
      );
      const csv = await exportCsv();
      const [header, ...rows] = parseCsv(csv);
      // Colunas antigas mantêm a posição (aditivo); as novas vêm no fim.
      expect(header.slice(0, 11)).toEqual([
         'identifier',
         'title',
         'status',
         'priority',
         'assignee',
         'assignees',
         'project',
         'estimate',
         'dueDate',
         'labels',
         'createdAt',
      ]);
      for (const col of ['description', 'parent', 'team', 'updatedAt'])
         expect(header).toContain(col);
      const get = (r: string[], col: string) => r[header.indexOf(col)];
      const paiRow = rows.find((r) => get(r, 'title') === 'Pai')!;
      const filhaRow = rows.find((r) => get(r, 'title') === 'Filha')!;
      expect(get(paiRow, 'description')).toBe('Linha 1, com vírgula');
      expect(get(filhaRow, 'parent')).toBe(pai.identifier);
      expect(get(filhaRow, 'team')).toBe('CORE');
      expect(get(filhaRow, 'updatedAt')).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const preview = await previewImport(db, { source: 'csv', csv });
      expect(preview.mapping.description).toBe('description');
      expect(preview.mapping.parent).toBe('parent');
   });
});
