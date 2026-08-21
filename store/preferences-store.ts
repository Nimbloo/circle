import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferências por-usuário das telas de Settings (Preferences, Code & reviews,
 * AI & Agents, Agent personalization) que NÃO têm subsistema dedicado.
 *
 * Persistidas em localStorage (cache/no-flash) e sincronizadas server-side via
 * `user-settings-sync` (fonte da verdade = banco, blob `user_settings.data`).
 * Selects guardam o rótulo exibido; toggles guardam boolean.
 *
 * As três preferências visuais (`fontSize`, `pointerCursors`, `underlineLinks`)
 * são HONRADAS no app inteiro pelo `PreferencesApplier` (atributos em <html> +
 * regras em globals.css). As demais persistem por-usuário (o efeito no fluxo
 * quente depende de subsistemas ainda não construídos).
 */
export interface Preferences {
   // General
   defaultHomeView: string;
   displayNames: string;
   firstDayOfWeek: string;
   convertEmoticons: boolean;
   sendCommentsOn: string;
   // Interface (fontSize/pointerCursors/underlineLinks são honrados no app)
   fontSize: string;
   pointerCursors: boolean;
   underlineLinks: boolean;
   // Automations
   autoAssignSelf: boolean;
   assignSelfOnStart: boolean;
   // Code & reviews
   codeReviewsEnabled: boolean;
   autoConvertDrafts: boolean;
   mergeStrategy: string;
   codeTheme: string;
   codeFont: string;
   reviewComments: string;
   reviewRequests: boolean;
   githubTeamRequests: boolean;
   checksMergeQueue: boolean;
   requireSignedCommits: boolean;
   gitAttachmentFormat: string;
   gitBranchCopyMoveStarted: boolean;
   openCodingToolMoveStarted: boolean;
   // AI & Agents
   aiUsageFeedback: boolean;
   // Agent personalization
   agentGuidance: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
   defaultHomeView: 'Agent (default)',
   displayNames: 'Username',
   firstDayOfWeek: 'Monday',
   convertEmoticons: true,
   sendCommentsOn: '⌘+Enter',
   fontSize: 'Default',
   pointerCursors: true,
   underlineLinks: false,
   autoAssignSelf: true,
   assignSelfOnStart: true,
   codeReviewsEnabled: true,
   autoConvertDrafts: false,
   mergeStrategy: 'Squash and merge',
   codeTheme: 'Nimbloo Light',
   codeFont: '12px, Regular, Default',
   reviewComments: 'Exclude Bots',
   reviewRequests: true,
   githubTeamRequests: true,
   checksMergeQueue: true,
   requireSignedCommits: false,
   gitAttachmentFormat: 'Title',
   gitBranchCopyMoveStarted: true,
   openCodingToolMoveStarted: true,
   aiUsageFeedback: true,
   agentGuidance: '',
};

const BOOLEAN_KEYS = new Set<keyof Preferences>(
   (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).filter(
      (k) => typeof DEFAULT_PREFERENCES[k] === 'boolean'
   )
);

interface PreferencesState extends Preferences {
   setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
   /** Aplica um patch vindo do servidor (só chaves conhecidas, com o tipo certo). */
   hydratePrefs: (patch: Partial<Preferences>) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
   persist(
      (set) => ({
         ...DEFAULT_PREFERENCES,
         setPref: (key, value) => set({ [key]: value } as Partial<Preferences>),
         hydratePrefs: (patch) => {
            const clean: Partial<Preferences> = {};
            (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).forEach((k) => {
               const value = patch[k];
               if (value === undefined) return;
               const wantsBoolean = BOOLEAN_KEYS.has(k);
               if (wantsBoolean ? typeof value === 'boolean' : typeof value === 'string') {
                  (clean as Record<string, unknown>)[k] = value;
               }
            });
            set(clean);
         },
      }),
      { name: 'user-preferences' }
   )
);
