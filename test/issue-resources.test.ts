import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { addIssueResource, removeIssueResource, getIssueDetail } from '@/lib/api/issue-detail';

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id };
}

describe('issue resources', () => {
   it('adiciona um link e um documento e aparecem no detail', async () => {
      const { db, issueId } = await setup();
      await addIssueResource(db, issueId, {
         kind: 'link',
         label: 'Linear',
         url: 'https://linear.app',
      });
      await addIssueResource(db, issueId, {
         kind: 'document',
         label: 'Spec',
         url: '/nimbloo/document/abc',
      });
      const detail = await getIssueDetail(db, issueId, undefined);
      const kinds = detail!.resources.map((r) => r.kind).sort();
      expect(kinds).toEqual(['document', 'link']);
   });

   it('normaliza kind desconhecido para "link"', async () => {
      const { db, issueId } = await setup();
      const r = await addIssueResource(db, issueId, {
         kind: 'whatever',
         label: 'X',
         url: 'https://x.com',
      });
      expect(r.kind).toBe('link');
   });

   it('exige label e url e 404 se a issue não existe', async () => {
      const { db, issueId } = await setup();
      await expect(
         addIssueResource(db, issueId, { kind: 'link', label: '', url: 'https://x.com' })
      ).rejects.toThrow(/label/i);
      await expect(
         addIssueResource(db, issueId, { kind: 'link', label: 'X', url: '' })
      ).rejects.toThrow(/url/i);
      await expect(
         addIssueResource(db, 'nao-existe', { kind: 'link', label: 'X', url: 'https://x.com' })
      ).rejects.toThrow(/não encontrada/i);
   });

   it('remove um resource', async () => {
      const { db, issueId } = await setup();
      const r = await addIssueResource(db, issueId, {
         kind: 'link',
         label: 'X',
         url: 'https://x.com',
      });
      expect(await removeIssueResource(db, r.id)).toBe(true);
      const detail = await getIssueDetail(db, issueId, undefined);
      expect(detail!.resources).toHaveLength(0);
   });
});
