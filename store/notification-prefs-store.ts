import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Só os canais que o servidor honra (`notify.ts`). Os toggles de "Updates from Nimbloo"
 * (changelog, marketing, invite accepted, privacy) não tinham efeito nenhum e saíram;
 * o schema do servidor ainda aceita essas chaves legadas nos blobs gravados.
 */
export type NotificationPrefKey = 'emailNotifications' | 'slackNotifications';

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
   emailNotifications: true,
   slackNotifications: true,
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
         ...DEFAULT_NOTIFICATION_PREFS,
         setPref: (key, value) => set({ [key]: value } as Partial<NotificationPrefs>),
         hydratePrefs: (patch) => {
            const clean: Partial<NotificationPrefs> = {};
            (Object.keys(DEFAULT_NOTIFICATION_PREFS) as NotificationPrefKey[]).forEach((k) => {
               if (typeof patch[k] === 'boolean') clean[k] = patch[k];
            });
            set(clean);
         },
      }),
      { name: 'notification-prefs' }
   )
);
