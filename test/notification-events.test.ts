import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import {
   createNotification,
   markAllRead,
   setRead,
   setSnooze,
   type NotificationEventPatch,
} from '@/lib/api/notifications';

/**
 * #19 (servidor) — o evento de notificação leva o novo estado (`read`, `snoozedUntil`,
 * `all`) como campos aditivos: o cliente aplica como patch em vez de re-hidratar.
 */
let stop: (() => void) | null = null;
afterEach(() => stop?.());

async function setup() {
   const db = await makeTestDb();
   const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   const id = await createNotification(db, { recipientId: bob, type: 'comment', content: 'x' });
   const events: (CircleEvent & NotificationEventPatch)[] = [];
   stop = subscribe((e) => events.push(e as CircleEvent & NotificationEventPatch));
   return { db, bob, id, events };
}

describe('eventos de notificação com patch (#19)', () => {
   it('setRead publica `read`', async () => {
      const { db, bob, id, events } = await setup();
      await setRead(db, id, true, bob);
      expect(events).toEqual([
         expect.objectContaining({ entity: 'notification', id, recipientId: bob, read: true }),
      ]);
   });

   it('setSnooze publica `snoozedUntil` (ISO ou null)', async () => {
      const { db, bob, id, events } = await setup();
      const until = new Date('2030-01-01T00:00:00.000Z');
      await setSnooze(db, id, until, bob);
      await setSnooze(db, id, null, bob);
      expect(events.map((e) => e.snoozedUntil)).toEqual([until.toISOString(), null]);
   });

   it('markAllRead publica `all` + `read`', async () => {
      const { db, bob, events } = await setup();
      await markAllRead(db, bob);
      expect(events).toEqual([
         expect.objectContaining({
            entity: 'notification',
            recipientId: bob,
            read: true,
            all: true,
         }),
      ]);
   });
});
