import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createIssue, subscribeToIssue, unsubscribeFromIssue } from '@/lib/api/issues';
import { addComment, addReaction, deleteComment, updateComment } from '@/lib/api/issue-detail';
import { createNotification, markAllRead, setRead } from '@/lib/api/notifications';

/**
 * Formato dos eventos consumidos pelo cliente (frente B): campos ADITIVOS `issueId`
 * (comment/reação), `teamId` (fan-out por time) e `recipientId` (notificação).
 */
const EMAIL = 'ana@nimbloo.ai';
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;
let bobId: string;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Ana', email: EMAIL, teamIds: ['CORE'] });
   bobId = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai', teamIds: ['CORE'] });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
   vi.restoreAllMocks();
});

const novaIssue = () =>
   createIssue(db, { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' }, EMAIL);

describe('notificação vai ao destinatário (#18)', () => {
   it('created/updated levam recipientId', async () => {
      const id = await createNotification(db, { recipientId: bobId, type: 'assignment' });
      await setRead(db, id, true, bobId);
      await setRead(db, id, false, bobId);
      await markAllRead(db, bobId);
      const notifs = eventos.filter((e) => e.entity === 'notification');
      expect(notifs.length).toBe(4);
      expect(notifs.every((e) => e.recipientId === bobId)).toBe(true);
   });
});

describe('comentário e reação levam issueId (#19)', () => {
   it('criar, editar, reagir e excluir publicam issueId e teamId', async () => {
      const issue = await novaIssue();
      eventos = [];
      const c = await addComment(db, issue.id, 'oi', EMAIL);
      await updateComment(db, c.id, 'oi!', EMAIL);
      await addReaction(db, c.id, '👍', EMAIL);
      await deleteComment(db, c.id, EMAIL);
      const comments = eventos.filter((e) => e.entity === 'comment');
      expect(comments.map((e) => e.action)).toEqual(['created', 'updated', 'updated', 'deleted']);
      expect(comments.every((e) => e.issueId === issue.id && e.teamId === 'CORE')).toBe(true);
   });
});

describe('assinatura e primeiro login publicam (#35)', () => {
   it('subscribe/unsubscribe avisam o próprio usuário', async () => {
      const issue = await novaIssue();
      eventos = [];
      await subscribeToIssue(db, issue.id, bobId, 'bob@nimbloo.ai');
      await unsubscribeFromIssue(db, issue.id, bobId, 'bob@nimbloo.ai');
      const own = eventos.filter((e) => e.entity === 'member' && e.recipientId === bobId);
      expect(own.map((e) => e.action)).toEqual(['updated', 'updated']);
   });

   it('provisionar usuário novo publica member/created', async () => {
      const { getOrCreateUser } = await import('@/lib/api/users');
      eventos = [];
      await getOrCreateUser(db, 'novo@nimbloo.ai');
      await getOrCreateUser(db, 'novo@nimbloo.ai');
      const created = eventos.filter((e) => e.entity === 'member' && e.action === 'created');
      expect(created).toHaveLength(1);
   });
});

describe('eventos de issue carregam o time', () => {
   it('criar issue publica teamId', async () => {
      await novaIssue();
      const ev = eventos.find((e) => e.entity === 'issue' && e.action === 'created');
      expect(ev?.teamId).toBe('CORE');
   });
});
