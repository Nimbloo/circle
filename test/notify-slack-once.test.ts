import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { addComment } from '@/lib/api/issue-detail';
import { listInbox } from '@/lib/api/notifications';

/**
 * #49 — o Slack é um CANAL (webhook único): a notificação pessoal ia uma vez por
 * destinatário, com "você" sem dizer quem. Agora: uma mensagem por evento, texto neutro;
 * in-app e e-mail seguem por destinatário.
 */
const ACTOR = 'ana@nimbloo.ai';

describe('Slack: uma mensagem por evento (#49)', () => {
   let fetchMock: ReturnType<typeof vi.fn>;
   beforeEach(() => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/x';
      fetchMock = vi.fn(async () => ({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);
   });
   afterEach(() => {
      delete process.env.SLACK_WEBHOOK_URL;
      vi.unstubAllGlobals();
   });

   it('comentário com menções e responsável gera um único post no canal, sem "você"', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: ACTOR });
      const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
      const carol = await seedUser(db, { name: 'Carol', email: 'carol@nimbloo.ai' });
      const dave = await seedUser(db, { name: 'Dave', email: 'dave@nimbloo.ai' });
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', assigneeId: dave },
         ACTOR
      );
      fetchMock.mockClear();

      await addComment(db, issue.id, 'oi @bob e @carol', ACTOR);
      // Posts do evento de comentário (o feed "criada por" do create é outro evento).
      const commentPosts = () =>
         fetchMock.mock.calls
            .filter((c) => String(c[0]) === 'https://hooks.slack.test/x')
            .map((c) => JSON.parse(c[1].body).text as string)
            .filter((t) => t.startsWith('[Circle]'));
      await vi.waitFor(async () => {
         expect((await listInbox(db, bob)).length).toBe(1);
         expect((await listInbox(db, carol)).length).toBe(1);
         expect((await listInbox(db, dave)).length).toBe(1);
         expect(commentPosts().length).toBeGreaterThan(0);
      });
      expect(commentPosts()).toHaveLength(1);
      const text = commentPosts()[0];
      expect(text).toContain(issue.identifier);
      expect(text).not.toMatch(/você/i);
   });
});
