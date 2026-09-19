import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { getUserSettings, patchUserSettings, putUserSettings } from '@/lib/api/settings';
import { PATCH as patchSettingsRoute } from '@/app/api/v1/settings/route';

/**
 * #15 (decisão): settings por SEÇÃO com merge no servidor. O PUT do blob inteiro era
 * last-write-wins entre abas/dispositivos: mudar o tema numa aba apagava o layout salvo
 * pela outra. O PATCH troca só as seções enviadas e preserva o resto.
 */
const ANA = 'ana@nimbloo.ai';
let db: Db;
let uid = '';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   uid = await seedUser(db, { name: 'Ana', email: ANA });
});
afterEach(() => __setTestDb(null));

describe('PATCH /settings por seção (#15)', () => {
   it('troca só as seções enviadas e preserva as outras', async () => {
      await putUserSettings(db, uid, {
         theme: { mode: 'dark' },
         layout: { inboxListWidth: 420 },
      });
      const merged = await patchUserSettings(db, uid, { preferences: { fontSize: 'Large' } });
      expect(merged).toEqual({
         theme: { mode: 'dark' },
         layout: { inboxListWidth: 420 },
         preferences: { fontSize: 'Large' },
      });
      await patchUserSettings(db, uid, { theme: { mode: 'light' } });
      expect(await getUserSettings(db, uid)).toEqual({
         theme: { mode: 'light' },
         layout: { inboxListWidth: 420 },
         preferences: { fontSize: 'Large' },
      });
   });

   it('rota: valida o schema fechado e devolve o blob mesclado', async () => {
      const call = (body: unknown) =>
         patchSettingsRoute(
            new Request('http://x/api/v1/settings', {
               method: 'PATCH',
               headers: { 'x-forwarded-email': ANA, 'content-type': 'application/json' },
               body: JSON.stringify(body),
            })
         );
      const ok = await call({ notifications: { marketing: false } });
      expect(ok.status).toBe(200);
      expect((await ok.json()).data).toEqual({ notifications: { marketing: false } });
      expect((await call({ unknown: {} })).status).toBe(400);
      expect((await call({ theme: { custom: { accent: 7 } } })).status).toBe(400);
   });
});
