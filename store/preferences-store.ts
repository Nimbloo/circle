import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_HOME_VIEW } from '@/lib/home-view';

/**
 * Preferências por-usuário das telas de Settings (Preferences, Code & reviews,
 * Agent personalization) que NÃO têm subsistema dedicado.
 *
 * Persistidas em localStorage (cache/no-flash) e sincronizadas server-side via
 * `user-settings-sync` (fonte da verdade = banco, blob `user_settings.data`).
 * Selects guardam o rótulo exibido; toggles guardam boolean.
 *
 * TODA chave aqui tem efeito real no app (guarda: test/preferences-consumed-guard.test.ts).
 * As visuais (`fontSize`, `pointerCursors`, `underlineLinks`) pelo `PreferencesApplier`;
 * as demais no ponto de uso (landing da org, criação/status de issue, composers,
 * calendários, editor, nomes de pessoas, diff dos reviews, copiar branch/prompt, agente).
 * Opção que dependia de algo que o Circle não faz foi removida da UI e daqui; o schema
 * do servidor (`lib/api/settings.ts`) ainda aceita essas chaves legadas nos blobs gravados.
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
   codeFont: string;
   gitBranchCopyMoveStarted: boolean;
   /** "On copy as prompt, move issue to started status" (nome legado da chave). */
   openCodingToolMoveStarted: boolean;
   // Agent personalization
   agentGuidance: string;
}

/** Opções do select "Font" (Code & reviews), honradas no diff dos reviews. */
export const CODE_FONT_DEFAULT = '12px, Regular, Default';
export const CODE_FONT_MEDIUM = '13px, Medium';

export const DEFAULT_PREFERENCES: Preferences = {
   defaultHomeView: DEFAULT_HOME_VIEW,
   displayNames: 'Full name',
   firstDayOfWeek: 'Monday',
   convertEmoticons: true,
   sendCommentsOn: '⌘+Enter',
   fontSize: 'Default',
   pointerCursors: true,
   underlineLinks: false,
   autoAssignSelf: true,
   assignSelfOnStart: true,
   codeReviewsEnabled: true,
   codeFont: CODE_FONT_DEFAULT,
   gitBranchCopyMoveStarted: true,
   openCodingToolMoveStarted: true,
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
