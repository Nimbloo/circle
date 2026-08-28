import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { getSlackConfig, updateSlackConfig, notifySlackEvent } from '@/lib/api/integrations/slack';

describe('slack config', () => {
   it('defaults to all events enabled when no row exists', async () => {
      const db = await makeTestDb();
      const cfg = await getSlackConfig(db);
      expect(cfg).toEqual({
         onIssueCreated: true,
         onIssueCompleted: true,
         onIssueAssigned: true,
         onPrMerged: true,
      });
   });

   it('persists a partial update (upsert)', async () => {
      const db = await makeTestDb();
      const next = await updateSlackConfig(db, { onIssueCreated: false });
      expect(next.onIssueCreated).toBe(false);
      expect(next.onIssueCompleted).toBe(true);
      expect((await getSlackConfig(db)).onIssueCreated).toBe(false);
   });
});

describe('notifySlackEvent', () => {
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

   const bodyText = () => JSON.parse(fetchMock.mock.calls[0][1].body).text as string;

   it('sends when the event toggle is on', async () => {
      const db = await makeTestDb();
      const res = await notifySlackEvent(db, {
         type: 'issue.completed',
         identifier: 'ENG-1',
         title: 'Fix',
      });
      expect(res.sent).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(bodyText()).toContain('ENG-1');
      expect(bodyText()).toContain('concluída');
   });

   it('does not send when the event toggle is off', async () => {
      const db = await makeTestDb();
      await updateSlackConfig(db, { onIssueCreated: false });
      const res = await notifySlackEvent(db, {
         type: 'issue.created',
         identifier: 'ENG-2',
         title: 'New',
      });
      expect(res.sent).toBe(false);
      expect(res.reason).toBe('event-disabled');
      expect(fetchMock).not.toHaveBeenCalled();
   });

   it('formats each event type distinctly', async () => {
      const db = await makeTestDb();
      await notifySlackEvent(db, {
         type: 'issue.assigned',
         identifier: 'ENG-3',
         title: 'T',
         assignee: 'Ana',
      });
      expect(bodyText()).toContain('atribuída a Ana');
   });

   it('escapes Slack mention injection in user-controlled title', async () => {
      const db = await makeTestDb();
      await notifySlackEvent(db, {
         type: 'issue.created',
         identifier: 'ENG-9',
         title: '<!channel> pwn <@U123> & more',
      });
      const t = bodyText();
      expect(t).not.toContain('<!channel>');
      expect(t).not.toContain('<@U123>');
      expect(t).toContain('&lt;!channel&gt;');
      expect(t).toContain('&amp;');
   });

   it('no-ops without a webhook configured', async () => {
      delete process.env.SLACK_WEBHOOK_URL;
      const db = await makeTestDb();
      const res = await notifySlackEvent(db, {
         type: 'pr.merged',
         identifier: 'ENG-4',
         title: 'PR',
      });
      expect(res.sent).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
   });
});
