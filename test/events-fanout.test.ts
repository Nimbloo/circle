import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { eventForViewer, publish, type CircleEvent } from '@/lib/api/events';
import { GET as eventsRoute } from '@/app/api/v1/events/route';

/**
 * Fan-out por destinatário e por time (#18, Be#3/Cx#8): o stream decide o que entregar
 * SÓ com o que já carrega (userId e escopo resolvidos na abertura) — nenhuma query por
 * evento. Notificação vai só ao destinatário; convidado recebe COM id o que é do escopo
 * dele e não recebe nada do que é de fora.
 */
const ev = (e: Omit<CircleEvent, 'ts'>): CircleEvent => ({ ...e, ts: 1 });

describe('eventForViewer', () => {
   const admin = { userId: 'u-admin', teamIds: null };
   const guest = { userId: 'u-guest', teamIds: ['OPEN'] };

   it('notificação só chega ao destinatário (inclusive para admin)', () => {
      const n = ev({ entity: 'notification', action: 'created', id: 'n1', recipientId: 'u-guest' });
      expect(eventForViewer(n, admin)).toBeNull();
      expect(eventForViewer(n, guest)).toMatchObject({ id: 'n1', recipientId: 'u-guest' });
   });

   it('convidado recebe COM id o evento do próprio escopo', () => {
      const e = ev({
         entity: 'issue',
         action: 'updated',
         id: 'i1',
         teamId: 'OPEN',
         actorEmail: 'a@x',
      });
      expect(eventForViewer(e, guest)).toMatchObject({
         id: 'i1',
         teamId: 'OPEN',
         actorEmail: 'a@x',
      });
   });

   it('convidado NÃO recebe evento de time fora do escopo', () => {
      const e = ev({ entity: 'issue', action: 'updated', id: 'i2', teamId: 'SECRET' });
      expect(eventForViewer(e, guest)).toBeNull();
   });

   it('evento sem time continua redigido para o convidado', () => {
      const e = ev({ entity: 'label', action: 'created', id: 'l1', actorEmail: 'a@x' });
      expect(eventForViewer(e, guest)).toEqual({ entity: 'label', action: 'created', ts: 1 });
   });

   it('sem escopo restrito, tudo chega completo', () => {
      const e = ev({ entity: 'issue', action: 'updated', id: 'i2', teamId: 'SECRET' });
      expect(eventForViewer(e, admin)).toEqual(e);
   });

   it('resync atravessa para todos', () => {
      const e = ev({ entity: 'resync', action: 'updated' });
      expect(eventForViewer(e, guest)).toEqual(e);
      expect(eventForViewer(e, admin)).toEqual(e);
   });
});

let db: Db;
const ADMIN = 'admin@nimbloo.ai';
const GUEST = 'guest@nimbloo.ai';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Aberto');
   await seedTeam(db, 'SECRET', 'Secreto');
   await seedUser(db, { name: 'Admin', email: ADMIN, teamIds: ['OPEN', 'SECRET'], role: 'Admin' });
   await seedUser(db, { name: 'Guest', email: GUEST, teamIds: ['OPEN'], role: 'Guest' });
});
afterEach(() => __setTestDb(null));

/** Abre o stream, publica os eventos e devolve os `data:` recebidos. */
async function received(
   email: string,
   events: Omit<CircleEvent, 'ts'>[]
): Promise<Record<string, unknown>[]> {
   const res = await eventsRoute(
      new Request('http://x/api/v1/events', { headers: { 'x-forwarded-email': email } })
   );
   const reader = res.body!.getReader();
   const decoder = new TextDecoder();
   for (const e of events) publish(e);
   // Marcador final: sabemos que tudo antes dele já foi (ou não) entregue.
   publish({ entity: 'resync', action: 'updated' });
   let buffer = '';
   const out: Record<string, unknown>[] = [];
   for (let i = 0; i < 20; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n').filter((l) => l.startsWith('data: '));
      const parsed = lines.map((l) => JSON.parse(l.slice('data: '.length)));
      if (parsed.some((p) => p.entity === 'resync')) {
         out.push(...parsed.filter((p) => p.entity !== 'resync'));
         break;
      }
   }
   await reader.cancel();
   return out;
}

describe('stream SSE com fan-out', () => {
   it('notificação alheia não chega; a própria chega', async () => {
      const { getOrCreateUser } = await import('@/lib/api/users');
      const guest = await getOrCreateUser(db, GUEST);
      const got = await received(ADMIN, [
         { entity: 'notification', action: 'created', id: 'n-guest', recipientId: guest.id },
      ]);
      expect(got).toEqual([]);
      const own = await received(GUEST, [
         { entity: 'notification', action: 'created', id: 'n-guest', recipientId: guest.id },
      ]);
      expect(own.map((e) => e.id)).toEqual(['n-guest']);
   });

   it('convidado recebe id do escopo e descarta o de fora', async () => {
      const got = await received(GUEST, [
         { entity: 'issue', action: 'updated', id: 'secreta', teamId: 'SECRET' },
         { entity: 'issue', action: 'updated', id: 'aberta', teamId: 'OPEN' },
      ]);
      expect(got.map((e) => e.id)).toEqual(['aberta']);
   });
});
