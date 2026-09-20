import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import {
   createNotification,
   deleteNotification,
   listInboxPage,
   unreadCount,
} from '@/lib/api/notifications';

/**
 * co#3: o inbox mostrava só as 100 mais recentes (sem offset/cursor) e não havia como
 * excluir uma notificação. Paginação por cursor (createdAt, id) + DELETE escopado.
 */
async function setup(n: number) {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   const eve = await seedUser(db, { name: 'Eve', email: 'eve@nimbloo.ai' });
   const ids: string[] = [];
   for (let i = 0; i < n; i++)
      ids.push(await createNotification(db, { recipientId: bob, type: 'comment' }));
   return { db, bob, eve, ids };
}

describe('inbox — paginação por cursor', () => {
   it('percorre todas as páginas sem repetir nem pular', async () => {
      const { db, bob, ids } = await setup(7);
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
         const page = await listInboxPage(db, bob, { limit: 3, cursor: cursor ?? undefined });
         seen.push(...page.items.map((n) => n.id));
         cursor = page.nextCursor;
         pages++;
      } while (cursor && pages < 10);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(7);
      expect([...seen].sort()).toEqual([...ids].sort());
   });

   it('última página sem próximo cursor', async () => {
      const { db, bob } = await setup(3);
      const page = await listInboxPage(db, bob, { limit: 3 });
      expect(page.items).toHaveLength(3);
      expect(page.nextCursor).toBeNull();
   });

   it('empate de createdAt (mesmo instante, microssegundos) desempata por id', async () => {
      const { db, bob } = await setup(6);
      // Todas no mesmo instante com microssegundos: o cursor não pode depender do ISO em ms.
      await db.execute(
         sql`update notification set created_at = '2026-09-01 10:00:00.123456' where recipient_id = ${bob}`
      );
      const first = await listInboxPage(db, bob, { limit: 4 });
      const second = await listInboxPage(db, bob, { limit: 4, cursor: first.nextCursor! });
      const all = [...first.items, ...second.items].map((n) => n.id);
      expect(new Set(all).size).toBe(6);
      expect(second.nextCursor).toBeNull();
   });
});

describe('inbox — excluir notificação', () => {
   it('remove só a do destinatário, publica o evento e ajusta a contagem', async () => {
      const { db, bob, eve, ids } = await setup(2);
      const events: CircleEvent[] = [];
      const off = subscribe((e) => events.push(e));
      expect(await deleteNotification(db, ids[0], eve)).toBe(false); // anti-IDOR
      expect(await deleteNotification(db, ids[0], bob)).toBe(true);
      off();
      const page = await listInboxPage(db, bob, {});
      expect(page.items.map((n) => n.id)).toEqual([ids[1]]);
      expect(await unreadCount(db, bob)).toBe(1);
      const deleted = events.filter((e) => e.entity === 'notification' && e.action === 'deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toMatchObject({ id: ids[0], recipientId: bob, deleted: true });
   });
});
