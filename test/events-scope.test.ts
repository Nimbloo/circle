import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { publish } from '@/lib/api/events';
import { GET as eventsRoute } from '@/app/api/v1/events/route';

/**
 * O barramento SSE é global e o evento NÃO carrega o time, então filtrar por entidade
 * custaria uma query por evento. Para escopo restrito (#100) o corte é a REDAÇÃO: o
 * convidado recebe `entity`/`action` (suficiente para refazer as listas que ele vê) e
 * nunca `id` nem `actorEmail`, que revelavam atividade de times alheios.
 */
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

/** Abre o stream, publica um evento e devolve o primeiro `data:` recebido. */
async function firstEvent(email: string): Promise<Record<string, unknown>> {
   const res = await eventsRoute(
      new Request('http://x/api/v1/events', { headers: { 'x-forwarded-email': email } })
   );
   expect(res.status).toBe(200);
   const reader = res.body!.getReader();
   const decoder = new TextDecoder();
   publish({ entity: 'issue', action: 'updated', id: 'issue-secreta', actorEmail: ADMIN });
   let buffer = '';
   // O primeiro chunk é o comentário `: connected`; lê até aparecer um `data:`.
   for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const line = buffer.split('\n').find((l) => l.startsWith('data: '));
      if (line) {
         await reader.cancel();
         return JSON.parse(line.slice('data: '.length));
      }
   }
   await reader.cancel();
   throw new Error('nenhum evento recebido');
}

describe('stream de eventos e escopo', () => {
   it('convidado recebe o evento SEM id nem ator', async () => {
      const event = await firstEvent(GUEST);
      expect(event.entity).toBe('issue');
      expect(event.action).toBe('updated');
      expect(event.id).toBeUndefined();
      expect(event.actorEmail).toBeUndefined();
   });

   it('quem não tem escopo restrito continua recebendo o evento completo', async () => {
      const event = await firstEvent(ADMIN);
      expect(event.id).toBe('issue-secreta');
      expect(event.actorEmail).toBe(ADMIN);
   });
});
