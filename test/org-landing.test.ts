import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { orgLandingPath } from '@/lib/api/teams';
import { putUserSettings } from '@/lib/api/settings';

/** Ad#21–40: convidado sem time caía no 1º time do workspace (fora do escopo) ou em "criar time". */
describe('landing da org', () => {
   it('membro de time vai para o próprio time', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'ALFA', 'Alfa');
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
      expect(await orgLandingPath(db, 'ana@nimbloo.ai')).toBe('team/CORE/all');
   });

   it('membro sem time vai ao 1º time existente; workspace vazio → criar time', async () => {
      const db = await makeTestDb();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: [] });
      expect(await orgLandingPath(db, 'ana@nimbloo.ai')).toBe('settings/teams/new');
      await seedTeam(db, 'ALFA', 'Alfa');
      expect(await orgLandingPath(db, 'ana@nimbloo.ai')).toBe('team/ALFA/all');
   });

   it('convidado sem time vai para My issues, nunca para time alheio nem criar time', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'ALFA', 'Alfa');
      await seedUser(db, { name: 'Gus', email: 'gus@nimbloo.ai', teamIds: [], role: 'Guest' });
      expect(await orgLandingPath(db, 'gus@nimbloo.ai')).toBe('my-issues');
   });

   it('sem sessão → criar time (comportamento anterior; o middleware já exige login)', async () => {
      const db = await makeTestDb();
      expect(await orgLandingPath(db, null)).toBe('settings/teams/new');
   });
});

describe('landing da org — preferência "Default home view"', () => {
   async function withPref(value: unknown) {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      const id = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
      if (value !== undefined)
         await putUserSettings(db, id, { preferences: { defaultHomeView: value } });
      return db;
   }

   it('My issues / Inbox / Agent levam à tela escolhida', async () => {
      expect(await orgLandingPath(await withPref('My issues'), 'ana@nimbloo.ai')).toBe('my-issues');
      expect(await orgLandingPath(await withPref('Inbox'), 'ana@nimbloo.ai')).toBe('inbox');
      expect(await orgLandingPath(await withPref('Agent'), 'ana@nimbloo.ai')).toBe('agent');
   });

   it('Team issues, valor legado ("Agent (default)") ou ausente mantêm o time', async () => {
      expect(await orgLandingPath(await withPref('Team issues'), 'ana@nimbloo.ai')).toBe(
         'team/CORE/all'
      );
      expect(await orgLandingPath(await withPref('Agent (default)'), 'ana@nimbloo.ai')).toBe(
         'team/CORE/all'
      );
      expect(await orgLandingPath(await withPref(undefined), 'ana@nimbloo.ai')).toBe(
         'team/CORE/all'
      );
   });
});
