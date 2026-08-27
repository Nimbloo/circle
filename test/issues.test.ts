import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import {
   comment,
   commentReaction,
   issueRelation,
   issuePrLink,
   notification,
   activityEvent,
} from '@/db/schema';
import {
   createIssue,
   listIssues,
   getIssue,
   updateIssue,
   deleteIssue,
   reorderIssue,
   addLabel,
   removeLabel,
} from '@/lib/api/issues';

const ME = 'ana.silva@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

describe('issues', () => {
   it('creates issue with server-generated identifier, rank and createdBy', async () => {
      const db = await setup();
      const dto = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Primeira issue',
            statusId: 'to-do',
            priorityId: 'high',
            labelIds: ['bug'],
         },
         ME
      );
      expect(dto.identifier).toBe('CORE-1');
      expect(dto.rank).toBeTruthy();
      expect(dto.status.id).toBe('to-do');
      expect(dto.priority.id).toBe('high');
      expect(dto.createdBy?.email).toBe(ME);
      expect(dto.labels.map((l) => l.id)).toEqual(['bug']);
      expect(dto.cycleId).toBe(''); // sem ciclo = ''
      expect(dto.estimate).toBeNull(); // sem estimativa por padrão
   });

   it('persists estimate on create and update, and can clear it', async () => {
      const db = await setup();
      const created = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Com estimativa',
            statusId: 'to-do',
            priorityId: 'high',
            estimate: 5,
         },
         ME
      );
      expect(created.estimate).toBe(5);

      const bumped = await updateIssue(db, created.id, { estimate: 8 }, ME);
      expect(bumped?.estimate).toBe(8);

      const cleared = await updateIssue(db, created.id, { estimate: null }, ME);
      expect(cleared?.estimate).toBeNull();
   });

   it('increments identifier per team and ranks after the previous', async () => {
      const db = await setup();
      const a = await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'to-do', priorityId: 'medium' },
         ME
      );
      const b = await createIssue(
         db,
         { teamId: 'CORE', title: 'B', statusId: 'to-do', priorityId: 'medium' },
         ME
      );
      expect(a.identifier).toBe('CORE-1');
      expect(b.identifier).toBe('CORE-2');
      expect(a.rank < b.rank).toBe(true); // ordem lexicográfica
   });

   it('lists with filters: status, unassigned, and text search', async () => {
      const db = await setup();
      await createIssue(
         db,
         { teamId: 'CORE', title: 'Login bug', statusId: 'in-progress', priorityId: 'urgent' },
         ME
      );
      await createIssue(
         db,
         { teamId: 'CORE', title: 'Docs update', statusId: 'to-do', priorityId: 'low' },
         ME
      );

      expect(await listIssues(db, { status: ['in-progress'] })).toHaveLength(1);
      expect(await listIssues(db, { assignee: ['unassigned'] })).toHaveLength(2); // nenhum tem assignee
      const found = await listIssues(db, { q: 'login' });
      expect(found).toHaveLength(1);
      expect(found[0].title).toBe('Login bug');
   });

   it('busca por q casa também a descrição (corpo), não só título/identifier', async () => {
      const db = await setup();
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Alpha',
            statusId: 'to-do',
            priorityId: 'low',
            description: 'este corpo contém a palavra xyzzy escondida',
         },
         ME
      );
      await createIssue(
         db,
         { teamId: 'CORE', title: 'Beta', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const found = await listIssues(db, { q: 'xyzzy' });
      expect(found.map((i) => i.title)).toEqual(['Alpha']);
   });

   it('filters by label', async () => {
      const db = await setup();
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Bug one',
            statusId: 'to-do',
            priorityId: 'low',
            labelIds: ['bug'],
         },
         ME
      );
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Feature one',
            statusId: 'to-do',
            priorityId: 'low',
            labelIds: ['feature'],
         },
         ME
      );
      await createIssue(
         db,
         { teamId: 'CORE', title: 'No labels', statusId: 'to-do', priorityId: 'low' },
         ME
      );

      const bugs = await listIssues(db, { labels: ['bug'] });
      expect(bugs).toHaveLength(1);
      expect(bugs[0].title).toBe('Bug one');

      // multi-label = OR (issue com qualquer um dos labels)
      const either = await listIssues(db, { labels: ['bug', 'feature'] });
      expect(either.map((i) => i.title).sort()).toEqual(['Bug one', 'Feature one']);
   });

   it('filters by statusType (category) expanding to status ids', async () => {
      const db = await setup();
      await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'in-progress', priorityId: 'medium' },
         ME
      ); // started
      await createIssue(
         db,
         { teamId: 'CORE', title: 'B', statusId: 'backlog', priorityId: 'medium' },
         ME
      ); // backlog
      const started = await listIssues(db, { statusType: ['started'] });
      expect(started).toHaveLength(1);
      expect(started[0].status.id).toBe('in-progress');
   });

   it('updates partially and records a status activity event', async () => {
      const db = await setup();
      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const updated = await updateIssue(
         db,
         created.id,
         { statusId: 'done', title: 'X renamed' },
         ME
      );
      expect(updated?.status.id).toBe('done');
      expect(updated?.title).toBe('X renamed');
   });

   it('reorders via lexorank between neighbors', async () => {
      const db = await setup();
      const a = await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const b = await createIssue(
         db,
         { teamId: 'CORE', title: 'B', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const c = await createIssue(
         db,
         { teamId: 'CORE', title: 'C', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      // move C entre A e B
      const moved = await reorderIssue(db, c.id, a.id, b.id);
      expect(moved!.rank > a.rank && moved!.rank < b.rank).toBe(true);
   });

   it('adds and removes labels', async () => {
      const db = await setup();
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const withLabel = await addLabel(db, i.id, 'security', ME);
      expect(withLabel!.labels.map((l) => l.id)).toContain('security');
      const without = await removeLabel(db, i.id, 'security', ME);
      expect(without!.labels.map((l) => l.id)).not.toContain('security');

      // add/remove de label são gravados no histórico (activity feed)
      const events = (await db.select().from(activityEvent)).filter(
         (e) => e.issueId === i.id && e.event === 'label'
      );
      expect(events.length).toBe(2);
      expect(events.some((e) => e.text?.includes('added label'))).toBe(true);
      expect(events.some((e) => e.text?.includes('removed label'))).toBe(true);

      // re-remove (no-op) não gera evento duplicado
      await removeLabel(db, i.id, 'security', ME);
      const after = (await db.select().from(activityEvent)).filter(
         (e) => e.issueId === i.id && e.event === 'label'
      );
      expect(after.length).toBe(2);
   });

   it('deletes an issue', async () => {
      const db = await setup();
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', labelIds: ['bug'] },
         ME
      );
      expect(await deleteIssue(db, i.id)).toBe(true);
      expect(await getIssue(db, i.id)).toBeNull();
   });

   it('deletes issue with comments/reactions/relations(both dirs)/prLink/notification without FK error', async () => {
      const db = await setup();
      const target = await createIssue(
         db,
         { teamId: 'CORE', title: 'Target', statusId: 'to-do', priorityId: 'high' },
         ME
      );
      const other = await createIssue(
         db,
         { teamId: 'CORE', title: 'Other', statusId: 'to-do', priorityId: 'high' },
         ME
      );
      const authorId = target.createdBy!.id;

      // comment + reação
      const commentId = randomUUID();
      await db.insert(comment).values({
         id: commentId,
         issueId: target.id,
         authorId,
         body: 'oi',
         createdAt: new Date(),
      });
      await db.insert(commentReaction).values({ commentId, emoji: '👍', userId: authorId });

      // relações nas DUAS direções
      await db
         .insert(issueRelation)
         .values({ id: randomUUID(), issueId: target.id, relatedId: other.id, kind: 'related' });
      await db.insert(issueRelation).values({
         id: randomUUID(),
         issueId: other.id,
         relatedId: target.id,
         kind: 'blocked_by',
      });

      // link de PR
      await db
         .insert(issuePrLink)
         .values({ id: randomUUID(), issueId: target.id, title: 'PR #1', status: 'open' });

      // notificação
      await db.insert(notification).values({
         id: randomUUID(),
         issueId: target.id,
         actorId: authorId,
         recipientId: authorId,
         type: 'assignment',
         content: 'x',
         read: false,
         createdAt: new Date(),
      });

      // era o bug: sem limpar dependências, o delete violava FK / deixava órfãos
      expect(await deleteIssue(db, target.id)).toBe(true);
      expect(await getIssue(db, target.id)).toBeNull();
      // a issue relacionada continua íntegra (a relação inversa foi removida)
      expect(await getIssue(db, other.id)).not.toBeNull();
   });

   it('rejects createIssue with unknown statusId', async () => {
      const db = await setup();
      await expect(
         createIssue(db, { teamId: 'CORE', title: 'X', statusId: 'nope', priorityId: 'high' }, ME)
      ).rejects.toThrow(/Status/);
   });

   it('rejects addLabel on unknown issue', async () => {
      const db = await setup();
      await expect(addLabel(db, 'no-such-issue', 'bug', ME)).rejects.toThrow(/não encontrada/);
   });

   it('rejects addLabel with unknown label', async () => {
      const db = await setup();
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      await expect(addLabel(db, i.id, 'no-such-label', ME)).rejects.toThrow(/não existe/);
   });
});
