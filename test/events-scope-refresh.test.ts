import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { addTeamMember } from '@/lib/api/teams';
import { updateMemberRole } from '@/lib/api/members';
import { publish } from '@/lib/api/events';
import { GET as eventsRoute } from '@/app/api/v1/events/route';

/**
 * #13 — o escopo do SSE era resolvido UMA vez na abertura: convidado adicionado a um
 * time não recebia os eventos dele; membro rebaixado a guest seguia recebendo tudo.
 * Agora um evento `member` do próprio usuário (ou `team`) re-resolve o escopo e, se ele
 * mudou, o stream FECHA — o cliente reconecta com o escopo novo e re-hidrata.
 */
let db: Db;
const GUEST = 'guest@nimbloo.ai';
const MEMBER = 'member@nimbloo.ai';
let memberId = '';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Aberto');
   await seedTeam(db, 'SECRET', 'Secreto');
   await seedUser(db, {
      name: 'Admin',
      email: 'admin@nimbloo.ai',
      role: 'Admin',
      teamIds: ['OPEN'],
   });
   await seedUser(db, { name: 'Guest', email: GUEST, teamIds: ['OPEN'], role: 'Guest' });
   memberId = await seedUser(db, { name: 'Mem', email: MEMBER, teamIds: ['OPEN'] });
});
afterEach(() => __setTestDb(null));

async function open(email: string) {
   const res = await eventsRoute(
      new Request('http://x/api/v1/events', { headers: { 'x-forwarded-email': email } })
   );
   expect(res.status).toBe(200);
   const reader = res.body!.getReader();
   await reader.read(); // ': connected'
   return reader;
}

/** Lê até o stream fechar (true) ou esgotar as tentativas (false). */
async function closes(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<boolean> {
   for (let i = 0; i < 20; i++) {
      const next = await Promise.race([
         reader.read(),
         new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 250)),
      ]);
      if (next === 'timeout') return false;
      if (next.done) return true;
   }
   return false;
}

describe('escopo do SSE acompanha a membership (#13)', () => {
   it('convidado adicionado a um time: o stream fecha para reconectar', async () => {
      const reader = await open(GUEST);
      await addTeamMember(db, 'SECRET', GUEST);
      expect(await closes(reader)).toBe(true);
   });

   it('membro rebaixado a guest: o stream fecha', async () => {
      const reader = await open(MEMBER);
      await updateMemberRole(db, memberId, 'Guest');
      expect(await closes(reader)).toBe(true);
   });

   it('evento que não muda o escopo não fecha o stream', async () => {
      const reader = await open(GUEST);
      publish({ entity: 'team', action: 'updated', id: 'SECRET' });
      expect(await closes(reader)).toBe(false);
      await reader.cancel();
   });
});
