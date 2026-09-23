import { describe, expect, it } from 'vitest';
import { SettingsSchema } from '@/lib/api/settings';
import { DEFAULT_PREFERENCES, usePreferencesStore } from '@/store/preferences-store';

/** Chaves de opções removidas da UI (dependiam de algo que o Circle não faz). */
const LEGACY = {
   autoConvertDrafts: true,
   mergeStrategy: 'Rebase and merge',
   codeTheme: 'Nimbloo Dark',
   reviewComments: 'Everyone',
   reviewRequests: false,
   githubTeamRequests: false,
   checksMergeQueue: false,
   requireSignedCommits: true,
   gitAttachmentFormat: 'URL',
   aiUsageFeedback: false,
};

describe('preferências removidas — retrocompatibilidade', () => {
   it('saem do store (nenhum controle morto)', () => {
      for (const key of Object.keys(LEGACY)) expect(DEFAULT_PREFERENCES).not.toHaveProperty(key);
   });

   it('o servidor ainda aceita um blob antigo com as chaves legadas (sem 400)', () => {
      expect(() =>
         SettingsSchema.parse({ preferences: { ...LEGACY, fontSize: 'Large' } })
      ).not.toThrow();
   });

   it('hydratePrefs ignora as chaves legadas vindas do servidor e aplica as conhecidas', () => {
      usePreferencesStore.getState().hydratePrefs({ ...LEGACY, fontSize: 'Small' } as never);
      const state = usePreferencesStore.getState() as unknown as Record<string, unknown>;
      expect(state.fontSize).toBe('Small');
      for (const key of Object.keys(LEGACY)) expect(state).not.toHaveProperty(key);
   });
});
