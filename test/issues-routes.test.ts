import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { GET as listIssues, POST as createIssue } from '@/app/api/v1/issues/route';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

function get(url: string, email = 'dev@nimbloo.ai') {
   return new Request(url, { headers: { 'x-forwarded-email': email } });
}

function post(body: unknown, email = 'dev@nimbloo.ai') {
   return new Request('http://x/api/v1/issues', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-email': email },
      body: JSON.stringify(body),
   });
}

describe('issues routes (end-to-end via handlers)', () => {
   it('POST creates and GET lists it, with the {data} envelope', async () => {
      const created = await createIssue(
         post({ teamId: 'CORE', title: 'Rota', statusId: 'to-do', priorityId: 'high' })
      );
      expect(created.status).toBe(200);
      const cjson = await created.json();
      expect(cjson.data.identifier).toBe('CORE-1');
      expect(cjson.data.createdBy.email).toBe('dev@nimbloo.ai');

      const listed = await listIssues(get('http://x/api/v1/issues'));
      const ljson = await listed.json();
      expect(ljson.data).toHaveLength(1);
      expect(ljson.data[0].title).toBe('Rota');
   });

   it('POST accepts descriptionDoc (editor de blocos) and rejects an invalid doc with 400', async () => {
      const base = { teamId: 'CORE', title: 'Doc', statusId: 'to-do', priorityId: 'high' };
      const ok = await createIssue(
         post({
            ...base,
            descriptionDoc: {
               type: 'doc',
               content: [{ type: 'paragraph', content: [{ type: 'text', text: 'oi' }] }],
            },
         })
      );
      expect(ok.status).toBe(200);

      const bad = await createIssue(
         post({ ...base, descriptionDoc: { type: 'doc', content: [{ type: 'widget' }] } })
      );
      expect(bad.status).toBe(400);
   });

   it('POST without auth header returns 401 problem+json', async () => {
      const res = await createIssue(
         new Request('http://x/api/v1/issues', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               teamId: 'CORE',
               title: 'x',
               statusId: 'to-do',
               priorityId: 'high',
            }),
         })
      );
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
   });

   it('GET without auth header returns 401 (leitura não é pública)', async () => {
      const res = await listIssues(new Request('http://x/api/v1/issues'));
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
   });

   it('POST with invalid payload returns 400', async () => {
      const res = await createIssue(post({ teamId: 'CORE' })); // faltam campos obrigatórios
      expect(res.status).toBe(400);
   });

   it('GET filters by status via query string', async () => {
      await createIssue(
         post({ teamId: 'CORE', title: 'A', statusId: 'in-progress', priorityId: 'low' })
      );
      await createIssue(post({ teamId: 'CORE', title: 'B', statusId: 'to-do', priorityId: 'low' }));
      const res = await listIssues(get('http://x/api/v1/issues?status=in-progress'));
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].status.id).toBe('in-progress');
   });
});
