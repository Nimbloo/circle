import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import {
   getUserSettings,
   putUserSettings,
   SettingsSchema,
   MAX_SETTINGS_BYTES,
} from '@/lib/api/settings';
import { getOrCreateUser, updateProfile } from '@/lib/api/users';

describe('user settings (getUserSettings/putUserSettings)', () => {
   it('defaults to {} when nothing was saved', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      expect(await getUserSettings(db, uid)).toEqual({});
   });

   it('upserts and reads back the blob (insert then update)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });

      await putUserSettings(db, uid, {
         theme: { mode: 'dark' },
         notifications: { marketing: true },
      });
      expect(await getUserSettings(db, uid)).toEqual({
         theme: { mode: 'dark' },
         notifications: { marketing: true },
      });

      // onConflictDoUpdate: segunda gravação substitui (não duplica a PK).
      await putUserSettings(db, uid, { theme: { mode: 'light' } });
      expect(await getUserSettings(db, uid)).toEqual({ theme: { mode: 'light' } });
   });

   it('returns {} for a corrupt/non-object payload', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      // grava um JSON que não é objeto — o getter faz fallback pra {}
      await putUserSettings(db, uid, [1, 2, 3] as unknown as Record<string, unknown>);
      expect(await getUserSettings(db, uid)).toEqual({});
   });

   it('rejects a payload larger than the cap (413)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      const huge = { blob: 'x'.repeat(MAX_SETTINGS_BYTES + 1) };
      await expect(
         putUserSettings(db, uid, huge as unknown as Record<string, unknown>)
      ).rejects.toMatchObject({ status: 413 });
   });
});

describe('SettingsSchema (closed shape)', () => {
   it('accepts the real settings blob (theme + notifications)', () => {
      const blob = {
         theme: {
            mode: 'dark',
            lightVariant: 'light',
            darkVariant: 'magic-blue',
            custom: { accent: '#fff', contrast: 50, sidebar: true },
         },
         notifications: { marketing: true, privacyLegal: false },
      };
      expect(() => SettingsSchema.parse(blob)).not.toThrow();
   });

   it('accepts an empty object', () => {
      expect(SettingsSchema.parse({})).toEqual({});
   });

   it('rejects unknown top-level keys', () => {
      expect(() => SettingsSchema.parse({ evil: 'x'.repeat(1000) })).toThrow();
   });

   it('rejects unknown keys nested under theme', () => {
      expect(() => SettingsSchema.parse({ theme: { injected: true } })).toThrow();
   });

   it('accepts the preferences slice (selects as strings, toggles as booleans)', () => {
      const blob = {
         preferences: {
            defaultHomeView: 'Inbox',
            fontSize: 'Large',
            pointerCursors: false,
            underlineLinks: true,
            codeReviewsEnabled: true,
            mergeStrategy: 'Rebase and merge',
            agentGuidance: 'Be concise.',
         },
      };
      expect(() => SettingsSchema.parse(blob)).not.toThrow();
   });

   it('rejects unknown keys nested under preferences', () => {
      expect(() => SettingsSchema.parse({ preferences: { injected: true } })).toThrow();
   });

   it('rejects a wrong-typed preference (boolean where a string is expected)', () => {
      expect(() => SettingsSchema.parse({ preferences: { fontSize: true } })).toThrow();
   });
});

describe('updateProfile', () => {
   it('updates the name and returns the fresh MeDto', async () => {
      const db = await makeTestDb();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      const me = await updateProfile(db, 'ana@nimbloo.ai', { name: 'Ana Silva' });
      expect(me.name).toBe('Ana Silva');
      const persisted = await getOrCreateUser(db, 'ana@nimbloo.ai');
      expect(persisted.name).toBe('Ana Silva');
   });

   it('sets and clears the timezone', async () => {
      const db = await makeTestDb();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await updateProfile(db, 'ana@nimbloo.ai', { timezone: 'America/Sao_Paulo' });
      expect((await getOrCreateUser(db, 'ana@nimbloo.ai')).timezone).toBe('America/Sao_Paulo');
      await updateProfile(db, 'ana@nimbloo.ai', { timezone: null });
      expect((await getOrCreateUser(db, 'ana@nimbloo.ai')).timezone).toBeNull();
   });

   it('rejects an empty name and leaves the row untouched', async () => {
      const db = await makeTestDb();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await expect(updateProfile(db, 'ana@nimbloo.ai', { name: '   ' })).rejects.toThrow();
      expect((await getOrCreateUser(db, 'ana@nimbloo.ai')).name).toBe('Ana');
   });

   it('provisions the user if it does not exist yet', async () => {
      const db = await makeTestDb();
      const me = await updateProfile(db, 'new@nimbloo.ai', { name: 'New Person' });
      expect(me.name).toBe('New Person');
      expect(me.email).toBe('new@nimbloo.ai');
   });
});
