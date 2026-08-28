import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { listInbox, unreadCount, setSnooze } from '@/lib/api/notifications';

const ACTOR = 'ana@nimbloo.ai';

async function setupWithNotif() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ACTOR
   );
   await updateIssue(db, issue.id, { assigneeId: bob }, ACTOR); // gera 1 notificação p/ bob
   const [notif] = await listInbox(db, bob);
   return { db, bob, notifId: notif.id };
}

describe('notification snooze (#25)', () => {
   it('adiada some do inbox default e não conta como não-lida', async () => {
      const { db, bob, notifId } = await setupWithNotif();
      expect(await unreadCount(db, bob)).toBe(1);

      const until = new Date(Date.now() + 3600_000); // +1h
      expect(await setSnooze(db, notifId, until, bob)).toBe(true);

      expect(await listInbox(db, bob)).toHaveLength(0);
      expect(await unreadCount(db, bob)).toBe(0);
   });

   it('aba Snoozed (snoozed:true) mostra só as adiadas vigentes', async () => {
      const { db, bob, notifId } = await setupWithNotif();
      await setSnooze(db, notifId, new Date(Date.now() + 3600_000), bob);

      const snoozed = await listInbox(db, bob, { snoozed: true });
      expect(snoozed.map((n) => n.id)).toEqual([notifId]);
      expect(snoozed[0].snoozedUntil).not.toBeNull();
   });

   it('adiamento já vencido volta ao inbox', async () => {
      const { db, bob, notifId } = await setupWithNotif();
      await setSnooze(db, notifId, new Date(Date.now() - 1000), bob); // no passado
      expect(await listInbox(db, bob)).toHaveLength(1);
      expect(await unreadCount(db, bob)).toBe(1);
   });

   it('setSnooze(null) desfaz o adiamento', async () => {
      const { db, bob, notifId } = await setupWithNotif();
      await setSnooze(db, notifId, new Date(Date.now() + 3600_000), bob);
      expect(await listInbox(db, bob)).toHaveLength(0);

      expect(await setSnooze(db, notifId, null, bob)).toBe(true);
      expect(await listInbox(db, bob)).toHaveLength(1);
   });

   it('é escopada ao destinatário (anti-IDOR): outro usuário não adia', async () => {
      const { db, notifId } = await setupWithNotif();
      const eve = await seedUser(db, { name: 'Eve', email: 'eve@nimbloo.ai' });
      expect(await setSnooze(db, notifId, new Date(Date.now() + 3600_000), eve)).toBe(false);
   });
});
