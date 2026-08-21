/**
 * Sincroniza as preferências por-usuário (tema + notificações) com o servidor.
 * O localStorage (zustand persist) segue como cache/no-flash; a FONTE DA VERDADE
 * por-usuário é o banco (GET/PUT /api/v1/settings).
 *
 * - Boot: carrega do servidor e aplica nos stores, DEPOIS assina os stores.
 * - Change: grava no servidor (PUT) com debounce.
 */
import { api } from '@/lib/client';
import {
   useThemeStore,
   type ThemeMode,
   type LightVariant,
   type DarkVariant,
   type CustomTheme,
} from '@/store/theme-store';
import {
   useNotificationPrefsStore,
   type NotificationPrefs,
} from '@/store/notification-prefs-store';

interface ThemeSlice {
   mode: ThemeMode;
   lightVariant: LightVariant;
   darkVariant: DarkVariant;
   custom: CustomTheme;
}

interface SettingsBlob {
   theme?: Partial<ThemeSlice>;
   notifications?: Partial<NotificationPrefs>;
}

let started = false;
let ready = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function themeSlice(): ThemeSlice {
   const t = useThemeStore.getState();
   return {
      mode: t.mode,
      lightVariant: t.lightVariant,
      darkVariant: t.darkVariant,
      custom: t.custom,
   };
}

function snapshot(): SettingsBlob {
   const n = useNotificationPrefsStore.getState();
   return {
      theme: themeSlice(),
      notifications: {
         showUpdatesInSidebar: n.showUpdatesInSidebar,
         changelogNewsletter: n.changelogNewsletter,
         marketing: n.marketing,
         inviteAccepted: n.inviteAccepted,
         privacyLegal: n.privacyLegal,
      },
   };
}

function scheduleSave() {
   if (!ready) return;
   if (timer) clearTimeout(timer);
   timer = setTimeout(() => {
      void api.settings.put(snapshot() as Record<string, unknown>).catch(() => undefined);
   }, 800);
}

function applyTheme(theme: Partial<ThemeSlice> | undefined) {
   if (!theme || typeof theme !== 'object') return;
   const patch: Partial<ThemeSlice> = {};
   if (theme.mode) patch.mode = theme.mode;
   if (theme.lightVariant) patch.lightVariant = theme.lightVariant;
   if (theme.darkVariant) patch.darkVariant = theme.darkVariant;
   if (theme.custom && typeof theme.custom === 'object') patch.custom = theme.custom;
   if (Object.keys(patch).length > 0) useThemeStore.setState(patch);
}

/**
 * Carrega as settings do servidor e liga a gravação automática. Idempotente:
 * chamável várias vezes (só o primeiro boot roda). Nunca lança.
 */
export async function startUserSettingsSync(): Promise<void> {
   if (started) return;
   started = true;
   try {
      const data = (await api.settings.get()) as SettingsBlob;
      applyTheme(data.theme);
      if (data.notifications) useNotificationPrefsStore.getState().hydratePrefs(data.notifications);
   } catch {
      // sem sessão / sem settings ainda — segue com os defaults locais.
   }
   ready = true;
   // Assina DEPOIS de aplicar, pra não regravar o que acabou de carregar.
   useThemeStore.subscribe(scheduleSave);
   useNotificationPrefsStore.subscribe(scheduleSave);
}
