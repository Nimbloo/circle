import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { createProject } from '@/lib/api/projects';
import { getIssueDetail, updateIssueContent } from '@/lib/api/issue-detail';
import { getProjectDetail, updateProjectDetail } from '@/lib/api/project-detail';
import { ApiError } from '@/lib/api/errors';
import { EMPTY_DOC, type EditorDoc } from '@/lib/editor-doc';

const ME = 'dev@nimbloo.ai';

const DOC: EditorDoc = {
   type: 'doc',
   content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plano' }] },
      {
         type: 'paragraph',
         content: [
            { type: 'text', text: 'Texto ' },
            { type: 'text', text: 'forte', marks: [{ type: 'bold' }] },
         ],
      },
      {
         type: 'taskList',
         content: [
            {
               type: 'taskItem',
               attrs: { checked: true },
               content: [{ type: 'paragraph', content: [{ type: 'text', text: 'feito' }] }],
            },
         ],
      },
   ],
};

async function anIssue() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', description: 'antigo' },
      ME
   );
   return { db, issue };
}

describe('PATCH descriptionDoc (issue) #16', () => {
   it('grava o doc e deriva a projeção em texto (markdown)', async () => {
      const { db, issue } = await anIssue();
      const dto = await updateIssueContent(db, issue.id, { descriptionDoc: DOC });
      expect(dto?.descriptionDoc).toEqual(DOC);
      expect(dto?.description).toBe('# Plano\n\nTexto **forte**\n\n- [x] feito');
      // persistido (não só ecoado)
      expect((await getIssueDetail(db, issue.id))?.descriptionDoc).toEqual(DOC);
   });

   it('quando só `description` vem (cliente antigo), o doc fica nulo', async () => {
      const { db, issue } = await anIssue();
      await updateIssueContent(db, issue.id, { descriptionDoc: DOC });
      const dto = await updateIssueContent(db, issue.id, { description: 'só texto' });
      expect(dto?.description).toBe('só texto');
      expect(dto?.descriptionDoc).toBeNull();
   });

   it('doc vazio limpa a descrição (texto e doc nulos)', async () => {
      const { db, issue } = await anIssue();
      const dto = await updateIssueContent(db, issue.id, { descriptionDoc: EMPTY_DOC });
      expect(dto?.description).toBeNull();
      expect(dto?.descriptionDoc).toBeNull();
   });

   it('doc com nó desconhecido → 400', async () => {
      const { db, issue } = await anIssue();
      await expect(
         updateIssueContent(db, issue.id, {
            descriptionDoc: { type: 'doc', content: [{ type: 'widget' }] },
         })
      ).rejects.toMatchObject({ status: 400 } satisfies Partial<ApiError>);
   });

   it('milestone continua editável sem tocar na descrição', async () => {
      const { db, issue } = await anIssue();
      await updateIssueContent(db, issue.id, { descriptionDoc: DOC });
      const dto = await updateIssueContent(db, issue.id, { milestone: 'M1' });
      expect(dto?.milestone).toBe('M1');
      expect(dto?.descriptionDoc).toEqual(DOC);
   });
});

describe('POST descriptionDoc (create issue) #16', () => {
   const base = { teamId: 'CORE', statusId: 'to-do', priorityId: 'low' };

   it('grava o doc e deriva a projeção em texto na criação', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const issue = await createIssue(db, { ...base, title: 'X', descriptionDoc: DOC }, ME);
      const detail = await getIssueDetail(db, issue.id);
      expect(detail?.descriptionDoc).toEqual(DOC);
      expect(detail?.description).toBe('# Plano\n\nTexto **forte**\n\n- [x] feito');
   });

   it('doc vazio na criação → sem descrição; `description` (cliente antigo) segue valendo', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const empty = await createIssue(db, { ...base, title: 'A', descriptionDoc: EMPTY_DOC }, ME);
      expect((await getIssueDetail(db, empty.id))?.description).toBeNull();

      const legacy = await createIssue(db, { ...base, title: 'B', description: 'texto' }, ME);
      const detail = await getIssueDetail(db, legacy.id);
      expect(detail?.description).toBe('texto');
      expect(detail?.descriptionDoc).toBeNull();
   });

   it('doc inválido na criação → 400 (nada é criado)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await expect(
         createIssue(
            db,
            { ...base, title: 'X', descriptionDoc: { type: 'doc', content: [{ type: 'widget' }] } },
            ME
         )
      ).rejects.toMatchObject({ status: 400 } satisfies Partial<ApiError>);
   });
});

describe('PATCH descriptionDoc (project) #16', () => {
   const base = {
      statusId: 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
      teamId: 'CORE' as const,
   };

   it('grava o doc e deriva a projeção em blocos (contrato legado)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const proj = await createProject(db, { name: 'P', ...base });
      const dto = await updateProjectDetail(db, proj.id, { descriptionDoc: DOC });
      expect(dto?.descriptionDoc).toEqual(DOC);
      expect(dto?.description).toEqual([
         { type: 'heading', text: 'Plano', level: 1 },
         { type: 'paragraph', text: 'Texto **forte**' },
         { type: 'checklist', items: [{ text: 'feito', checked: true }] },
      ]);
      expect((await getProjectDetail(db, proj.id))?.descriptionDoc).toEqual(DOC);

      // Cliente antigo mandando blocos zera o doc.
      const legacy = await updateProjectDetail(db, proj.id, {
         description: [{ type: 'paragraph', text: 'x' }],
      });
      expect(legacy?.descriptionDoc).toBeNull();
      expect(legacy?.description).toEqual([{ type: 'paragraph', text: 'x' }]);
   });
});
