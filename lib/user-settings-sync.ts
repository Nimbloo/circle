/**
 * Sincroniza as preferências por-usuário (tema + notificações + preferences + layout)
 * com o servidor. O localStorage (zustand persist) segue como cache/no-flash; a
 * FONTE DA VERDADE por-usuário é o banco (GET/PUT /api/v1/settings).
 *
 * - Boot: carrega do servidor e aplica nos stores (servidor vence o localStorage),
 *   DEPOIS assina os stores.
 * - Change: grava no servidor (PUT) com debounce.
 */
import { api } from '@/lib/client';
import { MAX_SETTINGS_BYTES } from '@/lib/settings-limits';
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
import {
   usePreferencesStore,
   DEFAULT_PREFERENCES,
   type Preferences,
} from '@/store/preferences-store';
import {
   isDefaultDisplaySettings,
   useDisplaySettingsStore,
   type ViewDisplaySettings,
} from '@/store/display-settings-store';
import { DEFAULT_VIEW_TYPE, useViewTypeStore, type ViewType } from '@/store/view-store';
import { useSidebarTeamsStore } from '@/store/sidebar-teams-store';
import { useSidebarPrefsStore, type SidebarPrefs } from '@/store/sidebar-prefs-store';
import { useDetailPanelStore, type DetailPanelKind } from '@/store/detail-panel-store';
import { useInboxLayoutStore } from '@/store/inbox-layout-store';

interface ThemeSlice {
   mode: ThemeMode;
   lightVariant: LightVariant;
   darkVariant: DarkVariant;
   custom: CustomTheme;
}

/** Espelha `LayoutSchema` de lib/api/settings.ts. */
export interface LayoutBlob {
   displayByView?: Record<string, Partial<ViewDisplaySettings>>;
   viewTypeByView?: Record<string, ViewType>;
   sidebarTeams?: { openById: Record<string, boolean> };
   sidebarPrefs?: Partial<SidebarPrefs>;
   detailPanels?: { openByKind: Partial<Record<DetailPanelKind, boolean>> };
   inboxListWidth?: number;
}

interface SettingsBlob {
   theme?: Partial<ThemeSlice>;
   notifications?: Partial<NotificationPrefs>;
   preferences?: Partial<Preferences>;
   layout?: LayoutBlob;
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

function preferencesSlice(): Preferences {
   const p = usePreferencesStore.getState();
   // Só as chaves de `Preferences` (descarta setPref/hydratePrefs) e na ordem do default.
   const slice = {} as Preferences;
   (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).forEach((k) => {
      (slice as unknown as Record<string, unknown>)[k] = p[k];
   });
   return slice;
}

/**
 * Layout a partir dos stores. Views nos defaults não entram (reset = ausência), o que
 * mantém o blob pequeno e faz o "servidor vence" também limpar a view em outro device.
 */
function layoutSlice(): LayoutBlob {
   const displayByView: Record<string, ViewDisplaySettings> = {};
   Object.entries(useDisplaySettingsStore.getState().byView).forEach(([viewKey, settings]) => {
      if (!isDefaultDisplaySettings(settings)) displayByView[viewKey] = settings;
   });
   const viewTypeByView: Record<string, ViewType> = {};
   Object.entries(useViewTypeStore.getState().viewTypeByView).forEach(([viewKey, viewType]) => {
      if (viewType !== DEFAULT_VIEW_TYPE) viewTypeByView[viewKey] = viewType;
   });
   const sidebar = useSidebarPrefsStore.getState();
   return {
      displayByView,
      viewTypeByView,
      sidebarTeams: { openById: useSidebarTeamsStore.getState().openById },
      sidebarPrefs: {
         badgeStyle: sidebar.badgeStyle,
         visibility: sidebar.visibility,
         order: sidebar.order,
      },
      detailPanels: { openByKind: useDetailPanelStore.getState().openByKind },
      inboxListWidth: useInboxLayoutStore.getState().listWidth,
   };
}

function byteLength(value: unknown): number {
   return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Garante o teto do servidor (`MAX_SETTINGS_BYTES`, senão o PUT volta 413 e NADA é
 * salvo): descarta as views mais antigas dos mapas por view até caber. Só acontece
 * com centenas de views customizadas — o resto do blob é pequeno e fixo.
 */
function fitToCap(blob: SettingsBlob): SettingsBlob {
   const layout = blob.layout;
   if (!layout || byteLength(blob) <= MAX_SETTINGS_BYTES) return blob;
   const displayByView = { ...(layout.displayByView ?? {}) };
   const viewTypeByView = { ...(layout.viewTypeByView ?? {}) };
   const trimmed = { ...blob, layout: { ...layout, displayByView, viewTypeByView } };
   while (byteLength(trimmed) > MAX_SETTINGS_BYTES) {
      const displayKey = Object.keys(displayByView)[0];
      const viewTypeKey = Object.keys(viewTypeByView)[0];
      if (displayKey !== undefined) delete displayByView[displayKey];
      else if (viewTypeKey !== undefined) delete viewTypeByView[viewTypeKey];
      else break;
   }
   return trimmed;
}

function snapshot(): SettingsBlob {
   const n = useNotificationPrefsStore.getState();
   return fitToCap({
      theme: themeSlice(),
      notifications: {
         emailNotifications: n.emailNotifications,
         slackNotifications: n.slackNotifications,
         showUpdatesInSidebar: n.showUpdatesInSidebar,
         changelogNewsletter: n.changelogNewsletter,
         marketing: n.marketing,
         inviteAccepted: n.inviteAccepted,
         privacyLegal: n.privacyLegal,
      },
      preferences: preferencesSlice(),
      layout: layoutSlice(),
   });
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

/** Servidor vence: cada chave presente substitui o estado local correspondente. */
function applyLayout(layout: LayoutBlob | undefined) {
   if (!layout || typeof layout !== 'object') return;
   if (layout.displayByView && typeof layout.displayByView === 'object') {
      useDisplaySettingsStore.getState().hydrateByView(layout.displayByView);
   }
   if (layout.viewTypeByView && typeof layout.viewTypeByView === 'object') {
      useViewTypeStore.getState().hydrateByView(layout.viewTypeByView);
   }
   if (layout.sidebarTeams?.openById && typeof layout.sidebarTeams.openById === 'object') {
      useSidebarTeamsStore.getState().hydrateOpenById(layout.sidebarTeams.openById);
   }
   if (layout.sidebarPrefs && typeof layout.sidebarPrefs === 'object') {
      useSidebarPrefsStore.getState().hydratePrefs(layout.sidebarPrefs);
   }
   if (layout.detailPanels?.openByKind && typeof layout.detailPanels.openByKind === 'object') {
      useDetailPanelStore.getState().hydratePanels(layout.detailPanels.openByKind);
   }
   if (typeof layout.inboxListWidth === 'number' && Number.isFinite(layout.inboxListWidth)) {
      useInboxLayoutStore.getState().setListWidth(layout.inboxListWidth);
   }
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
      if (data.preferences) usePreferencesStore.getState().hydratePrefs(data.preferences);
      applyLayout(data.layout);
   } catch {
      // sem sessão / sem settings ainda — segue com os defaults locais.
   }
   ready = true;
   // Assina DEPOIS de aplicar, pra não regravar o que acabou de carregar.
   useThemeStore.subscribe(scheduleSave);
   useNotificationPrefsStore.subscribe(scheduleSave);
   usePreferencesStore.subscribe(scheduleSave);
   useDisplaySettingsStore.subscribe(scheduleSave);
   useViewTypeStore.subscribe(scheduleSave);
   useSidebarTeamsStore.subscribe(scheduleSave);
   useSidebarPrefsStore.subscribe(scheduleSave);
   useDetailPanelStore.subscribe(scheduleSave);
   useInboxLayoutStore.subscribe(scheduleSave);
}
