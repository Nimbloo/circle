import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import {
   addComment,
   listActivity,
   listComments,
   resolveComment,
   updateComment,
} from '@/lib/api/issue-detail';
import { listInbox } from '@/lib/api/notifications';
import { notificationEmailHtml } from '@/lib/api/integrations/email-templates';

const ANA = 'ana@nimbloo.ai'; // autora da raiz
const BOB = 'bob@nimbloo.ai'; // responsável da issue
const CAROL = 'carol@nimbloo.ai'; // participante
const DAN = 'dan@nimbloo.ai'; // admin
const EVE = 'eve@nimbloo.ai'; // sem relação

/** As notificações são fire-and-forget: dá uma volta no event loop antes de ler o inbox. */
const settle = () => new Promise((r) => setTimeout(r, 20));

async function setup(opts: { assignee?: boolean } = {}) {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const ana = await seedUser(db, { name: 'Ana', email: ANA });
   const bob = await seedUser(db, { name: 'Bob', email: BOB });
   const carol = await seedUser(db, { name: 'Carol', email: CAROL });
   await seedUser(db, { name: 'Dan', email: DAN, role: 'Admin' });
   await seedUser(db, { name: 'Eve', email: EVE });
   const issue = await createIssue(
      db,
      {
         teamId: 'CORE',
         title: 'X',
         statusId: 'to-do',
         priorityId: 'low',
         assigneeId: opts.assignee ? bob : null,
      },
      ANA
   );
   return { db, issueId: issue.id, ana, bob, carol };
}

describe('threads de comentário (#98) — resolver/reabrir', () => {
   it('autor da raiz resolve e reabre; DTO expõe resolvedAt/resolvedBy', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      expect(root.resolvedAt).toBeNull();

      const resolved = await resolveComment(db, root.id, true, ANA);
      expect(resolved?.resolvedAt).toBeTruthy();
      expect(resolved?.resolvedBy?.email).toBe(ANA);

      const reopened = await resolveComment(db, root.id, false, ANA);
      expect(reopened?.resolvedAt).toBeNull();
      expect(reopened?.resolvedBy).toBeNull();

      const [listed] = await listComments(db, issueId);
      expect(listed.resolvedAt).toBeNull();
   });

   it('responsável da issue e admin podem resolver; terceiro recebe 403', async () => {
      const { db, issueId } = await setup({ assignee: true });
      const root = await addComment(db, issueId, 'raiz', ANA);

      await expect(resolveComment(db, root.id, true, EVE)).rejects.toMatchObject({ status: 403 });
      expect((await resolveComment(db, root.id, true, BOB))?.resolvedBy?.email).toBe(BOB);
      expect((await resolveComment(db, root.id, false, DAN))?.resolvedAt).toBeNull();
   });

   it('resposta não pode ser resolvida (400); id inexistente → null', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      const reply = await addComment(db, issueId, 'r', BOB, root.id);
      await expect(resolveComment(db, reply.id, true, ANA)).rejects.toMatchObject({ status: 400 });
      expect(await resolveComment(db, 'nope', true, ANA)).toBeNull();
   });
});

describe('threads de comentário (#98) — edição', () => {
   it('PATCH do corpo grava updated_at e o feed expõe updatedAt', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'antes', ANA);
      expect(root.updatedAt).toBeNull();

      const edited = await updateComment(db, root.id, 'depois', ANA);
      expect(edited?.body).toBe('depois');
      expect(edited?.updatedAt).toBeTruthy();

      const feed = await listActivity(db, issueId);
      const item = feed.find((a) => a.kind === 'comment' && a.id === root.id);
      expect(item?.updatedAt).toBe(edited?.updatedAt);
      expect(item?.attachments).toEqual([]);
   });
});

describe('threads de comentário (#98) — notificações', () => {
   it('reply notifica autor da raiz e participantes uma vez cada, nunca o próprio ator', async () => {
      const { db, issueId, ana, bob, carol } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      await addComment(db, issueId, 'r1', BOB, root.id);
      await settle();
      // r1 (Bob) → só Ana (raiz) até aqui
      expect((await listInbox(db, ana)).filter((n) => n.type === 'comment')).toHaveLength(1);
      expect((await listInbox(db, bob)).filter((n) => n.type === 'comment')).toHaveLength(0);

      // r2 (Carol) → Ana (raiz) + Bob (participante), uma vez cada; Carol nada
      await addComment(db, issueId, 'r2', CAROL, root.id);
      await settle();
      const anaInbox = (await listInbox(db, ana)).filter((n) => n.type === 'comment');
      const bobInbox = (await listInbox(db, bob)).filter((n) => n.type === 'comment');
      expect(anaInbox).toHaveLength(2);
      expect(anaInbox[0].content).toBe('Carol respondeu ao seu comentário');
      expect(bobInbox).toHaveLength(1);
      expect(bobInbox[0].content).toBe('Carol respondeu em uma conversa que você participa');
      expect((await listInbox(db, carol)).filter((n) => n.type === 'comment')).toHaveLength(0);
   });

   it('participante que já respondeu 2x recebe UMA notificação por nova resposta', async () => {
      const { db, issueId, bob } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      await addComment(db, issueId, 'r1', BOB, root.id);
      await addComment(db, issueId, 'r2', BOB, root.id);
      await addComment(db, issueId, 'r3', CAROL, root.id);
      await settle();
      expect((await listInbox(db, bob)).filter((n) => n.type === 'comment')).toHaveLength(1);
   });

   it('assignee que participa da thread não é notificado duas vezes', async () => {
      const { db, issueId, bob } = await setup({ assignee: true });
      const root = await addComment(db, issueId, 'raiz', ANA);
      await settle();
      await addComment(db, issueId, 'r1', BOB, root.id);
      await addComment(db, issueId, 'r2', CAROL, root.id);
      await settle();
      // raiz da Ana (1) + r2 da Carol (1); r1 é do próprio Bob
      expect((await listInbox(db, bob)).filter((n) => n.type === 'comment')).toHaveLength(2);
   });

   it('e-mail de resposta cita o texto da raiz como contexto (escapado)', () => {
      const html = notificationEmailHtml({
         content: 'Bob respondeu ao seu comentário',
         identifier: 'CORE-1',
         issueTitle: 'X',
         contextText: 'raiz <b>bold</b>',
      });
      expect(html).toContain('<blockquote');
      expect(html).toContain('raiz &lt;b&gt;bold&lt;/b&gt;');
      expect(
         notificationEmailHtml({ content: 'c', identifier: 'CORE-1', issueTitle: 'X' })
      ).not.toContain('<blockquote');
   });
});
