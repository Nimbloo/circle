import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import {
   createNotification,
   listInbox,
   unreadCount,
   snoozeNotification,
   deleteNotification,
} from '@/lib/api/notifications';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';
const HOUR = 60 * 60 * 1000;

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const anaId = await seedUser(db, { name: 'Ana', email: ANA });
   const bobId = await seedUser(db, { name: 'Bob', email: BOB });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   const notify = (recipientId: string, snoozedUntil?: Date | null) =>
      createNotification(db, {
         recipientId,
         type: 'update',
         issueId: issue.id,
         actorId: bobId,
         snoozedUntil,
      });
   return { db, anaId, bobId, notify };
}

describe('notification snooze / delete / reminder', () => {
   it('adiar para o futuro esconde a notificação do inbox e da contagem', async () => {
      const { db, anaId, notify } = await setup();
      const id = await notify(anaId);
      expect(await listInbox(db, anaId)).toHaveLength(1);

      expect(await snoozeNotification(db, id, new Date(Date.now() + HOUR), anaId)).toBe(true);
      expect(await listInbox(db, anaId)).toHaveLength(0);
      expect(await unreadCount(db, anaId)).toBe(0);
   });

   it('desfazer o snooze (until=null) traz a notificação de volta', async () => {
      const { db, anaId, notify } = await setup();
      const id = await notify(anaId, new Date(Date.now() + HOUR));
      expect(await listInbox(db, anaId)).toHaveLength(0);
      await snoozeNotification(db, id, null, anaId);
      expect(await listInbox(db, anaId)).toHaveLength(1);
   });

   it('reminder: snooze com prazo já vencido aparece no inbox', async () => {
      const { db, anaId, notify } = await setup();
      await notify(anaId, new Date(Date.now() - HOUR)); // lembrete cujo horário já passou
      expect(await listInbox(db, anaId)).toHaveLength(1);
   });

   it('snooze e delete são escopados ao destinatário (anti-IDOR)', async () => {
      const { db, anaId, bobId, notify } = await setup();
      const id = await notify(anaId);
      // Bob não pode adiar nem deletar a notificação da Ana
      expect(await snoozeNotification(db, id, new Date(Date.now() + HOUR), bobId)).toBe(false);
      expect(await deleteNotification(db, id, bobId)).toBe(false);
      expect(await listInbox(db, anaId)).toHaveLength(1);
      // A própria Ana consegue deletar
      expect(await deleteNotification(db, id, anaId)).toBe(true);
      expect(await listInbox(db, anaId)).toHaveLength(0);
   });
});
