import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationPrefKey =
   | 'emailNotifications'
   | 'slackNotifications'
   | 'showUpdatesInSidebar'
   | 'changelogNewsletter'
   | 'marketing'
   | 'inviteAccepted'
   | 'privacyLegal';

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

const DEFAULT_PREFS: NotificationPrefs = {
   emailNotifications: true,
   slackNotifications: true,
   showUpdatesInSidebar: true,
   changelogNewsletter: false,
   marketing: false,
   inviteAccepted: true,
   privacyLegal: true,
};

interface NotificationPrefsState extends NotificationPrefs {
   setPref: (key: NotificationPrefKey, value: boolean) => void;
   /** Aplica um patch vindo do servidor (só chaves conhecidas). */
   hydratePrefs: (patch: Partial<NotificationPrefs>) => void;
}

/**
 * Preferências de notificação do usuário. Persistidas em localStorage (cache) e
 * sincronizadas server-side via user-settings-sync (fonte da verdade = banco).
 */
export const useNotificationPrefsStore = create<NotificationPrefsState>()(
   persist(
      (set) => ({
         ...DEFAULT_PREFS,
         setPref: (key, value) => set({ [key]: value } as Partial<NotificationPrefs>),
         hydratePrefs: (patch) => {
            const clean: Partial<NotificationPrefs> = {};
            (Object.keys(DEFAULT_PREFS) as NotificationPrefKey[]).forEach((k) => {
               if (typeof patch[k] === 'boolean') clean[k] = patch[k];
            });
            set(clean);
         },
      }),
      { name: 'notification-prefs' }
   )
);
