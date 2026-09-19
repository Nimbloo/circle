import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { patchUserSettings, putUserSettings } from '@/lib/api/settings';
import { getOrCreateUser } from '@/lib/api/users';

/**
 * ad#14 — preferências só apareciam nas outras abas depois de um reload. Gravar publica
 * um evento endereçado ao PRÓPRIO usuário; as outras abas dele relêem as settings.
 */
const ME = 'dev@nimbloo.ai';
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedUser(db, { name: 'Dev', email: ME });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
});

describe('settings do usuário ao vivo', () => {
   it('PATCH e PUT publicam evento de settings só para o dono', async () => {
      const me = await getOrCreateUser(db, ME);
      await patchUserSettings(db, me.id, { preferences: { underlineLinks: true } });
      await putUserSettings(db, me.id, { preferences: { underlineLinks: false } });
      expect(eventos.map((e) => [e.entity, e.action, e.recipientId])).toEqual([
         ['settings', 'updated', me.id],
         ['settings', 'updated', me.id],
      ]);
   });
});
