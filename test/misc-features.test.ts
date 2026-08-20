import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { createProject } from '@/lib/api/projects';
import {
   createView,
   resolveView,
   listViews,
   updateView,
   deleteView,
   getView,
} from '@/lib/api/views';
import {
   createNotification,
   listInbox,
   unreadCount,
   setRead,
   markAllRead,
} from '@/lib/api/notifications';
import {
   createFolder,
   createDocument,
   listTeamDocuments,
   updateDocument,
   deleteDocument,
} from '@/lib/api/documents';
import { issueMatrix, projectProgress } from '@/lib/api/aggregations';
import { getMe } from '@/lib/api/users';

const ME = 'dev@nimbloo.ai';

async function base() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

describe('views', () => {
   it('creates an issue view and resolves it against the filter', async () => {
      const db = await base();
      await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'in-progress', priorityId: 'low' },
         ME
      );
      await createIssue(
         db,
         { teamId: 'CORE', title: 'B', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const view = await createView(
         db,
         {
            slug: 'in-prog',
            name: 'Em progresso',
            type: 'issue',
            filter: { statusIds: ['in-progress'] },
         },
         ME
      );
      const res = await resolveView(db, view.id);
      expect(res?.type).toBe('issue');
      expect(res?.issues).toHaveLength(1);
      expect(res?.issues?.[0].status.id).toBe('in-progress');
   });

   it('updates and deletes a view', async () => {
      const db = await base();
      const v = await createView(db, { slug: 's', name: 'V', type: 'issue', filter: {} }, ME);
      expect(await listViews(db)).toHaveLength(1);
      const upd = await updateView(db, v.id, { name: 'V2', filter: { unassigned: true } }, ME);
      expect(upd?.name).toBe('V2');
      expect(upd?.filter.unassigned).toBe(true);
      expect(await deleteView(db, v.id, ME)).toBe(true);
      expect(await getView(db, v.id)).toBeNull();
   });

   it('does not let a non-owner edit or delete a view (IDOR -> 403)', async () => {
      const db = await base();
      await seedUser(db, { name: 'Owner', email: ME });
      const other = 'other@nimbloo.ai';
      const v = await createView(db, { slug: 's', name: 'V', type: 'issue', filter: {} }, ME);

      await expect(updateView(db, v.id, { name: 'Hacked' }, other)).rejects.toThrow();
      await expect(deleteView(db, v.id, other)).rejects.toThrow();
      // permanece intacta
      expect((await getView(db, v.id))?.name).toBe('V');

      // o dono consegue
      expect((await updateView(db, v.id, { name: 'V2' }, ME))?.name).toBe('V2');
   });

   it('returns null (404) when editing/deleting a view that does not exist', async () => {
      const db = await base();
      expect(await updateView(db, 'nope', { name: 'x' }, ME)).toBeNull();
      expect(await deleteView(db, 'nope', ME)).toBe(false);
   });
});

describe('inbox / notifications', () => {
   it('lists, counts unread, marks read and mark-all', async () => {
      const db = await base();
      const me = await seedUser(db, { name: 'Me', email: ME });
      const actor = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const n1 = await createNotification(db, {
         recipientId: me,
         type: 'assignment',
         issueId: issue.id,
         actorId: actor,
         content: 'te atribuiu',
      });
      await createNotification(db, {
         recipientId: me,
         type: 'comment',
         issueId: issue.id,
         actorId: actor,
      });

      expect(await unreadCount(db, me)).toBe(2);
      const inbox = await listInbox(db, me);
      expect(inbox).toHaveLength(2);
      expect(inbox[0].issue?.identifier).toBe('CORE-1');

      await setRead(db, n1, true, me);
      expect(await unreadCount(db, me)).toBe(1);
      expect(await markAllRead(db, me)).toBe(1);
      expect(await unreadCount(db, me)).toBe(0);
   });

   it('does not let user A mark user B notification as read (IDOR)', async () => {
      const db = await base();
      const a = await seedUser(db, { name: 'A', email: 'a@nimbloo.ai' });
      const b = await seedUser(db, { name: 'B', email: 'b@nimbloo.ai' });
      const nb = await createNotification(db, { recipientId: b, type: 'comment' });

      // A tenta marcar a notificação de B -> nada atualizado (escopo por dono)
      expect(await setRead(db, nb, true, a)).toBe(false);
      expect(await unreadCount(db, b)).toBe(1); // segue não-lida

      // O dono (B) consegue
      expect(await setRead(db, nb, true, b)).toBe(true);
      expect(await unreadCount(db, b)).toBe(0);
   });
});

describe('documents', () => {
   it('creates folders/documents and lists them nested', async () => {
      const db = await base();
      const folder = await createFolder(db, { teamId: 'CORE', name: 'Specs' });
      const doc = await createDocument(db, { folderId: folder.id, name: 'RFC', pinned: true }, ME);
      const folders = await listTeamDocuments(db, 'CORE');
      expect(folders).toHaveLength(1);
      expect(folders[0].documents).toHaveLength(1);
      expect(folders[0].documents[0].creator?.email).toBe(ME);

      expect(await updateDocument(db, doc.id, { name: 'RFC v2' })).toBe(true);
      expect(await deleteDocument(db, doc.id)).toBe(true);
      expect((await listTeamDocuments(db, 'CORE'))[0].documents).toHaveLength(0);
   });
});

describe('aggregations', () => {
   it('builds the status × priority matrix', async () => {
      const db = await base();
      await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'in-progress', priorityId: 'urgent' },
         ME
      );
      await createIssue(
         db,
         { teamId: 'CORE', title: 'B', statusId: 'in-progress', priorityId: 'urgent' },
         ME
      );
      await createIssue(
         db,
         { teamId: 'CORE', title: 'C', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      const m = await issueMatrix(db);
      expect(m.total).toBe(3);
      expect(m.cells['in-progress']['urgent']).toBe(2);
      expect(m.cells['to-do']['low']).toBe(1);
      expect(m.totalsByStatus['in-progress']).toBe(2);
   });

   it('computes project progress and breakdowns', async () => {
      const db = await base();
      const ana = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      const proj = await createProject(db, {
         name: 'P',
         statusId: 'in-progress',
         priorityId: 'high',
         healthId: 'on-track',
         teamId: 'CORE',
      });
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'A',
            statusId: 'done',
            priorityId: 'low',
            projectId: proj.id,
            assigneeId: ana,
         },
         ME
      ); // completed
      await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'B',
            statusId: 'in-progress',
            priorityId: 'low',
            projectId: proj.id,
            assigneeId: ana,
         },
         ME
      ); // started

      const prog = await projectProgress(db, proj.id);
      expect(prog?.scope).toBe(2);
      expect(prog?.started).toBe(1);
      expect(prog?.completed).toBe(1);
      expect(prog?.percentComplete).toBe(50);
      const anaRow = prog?.byAssignee.find((r) => r.label === 'Ana');
      expect(anaRow?.total).toBe(2);
      expect(anaRow?.completed).toBe(1);
   });
});

describe('me', () => {
   it('returns the current user with teams and admin flag', async () => {
      const db = await base();
      await seedUser(db, { name: 'Dev', email: ME, teamIds: ['CORE'] });
      const me = await getMe(db, ME);
      expect(me.email).toBe(ME);
      expect(me.teamIds).toEqual(['CORE']);
      expect(me.admin).toBe(false);
   });
});
