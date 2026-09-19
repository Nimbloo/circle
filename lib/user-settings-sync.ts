/**
 * Sincroniza as preferências por-usuário (tema + notificações + preferences + layout)
 * com o servidor. O localStorage (zustand persist) segue como cache/no-flash; a
 * FONTE DA VERDADE por-usuário é o banco (GET/PATCH /api/v1/settings).
 *
 * - Boot: carrega do servidor e aplica nos stores (servidor vence o localStorage),
 *   DEPOIS assina os stores. Sem um GET bem-sucedido NADA é gravado (#15): antes, um
 *   GET falho liberava a gravação e o 1º toggle apagava as settings do servidor. O GET
 *   é retentado com backoff.
 * - Change: grava SÓ a seção alterada (PATCH com merge no servidor, #15), com debounce.
 *   Falha fica exposta (`getSettingsSyncError`) e a seção é reenviada.
 */
import { useSyncExternalStore } from 'react';
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

type Section = keyof SettingsBlob;
export type SettingsSyncError = 'load' | 'save' | null;

let started = false;
let ready = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let loadAttempts = 0;
/** Seções alteradas desde a última gravação confirmada. */
const dirty = new Set<Section>();

let syncError: SettingsSyncError = null;
const errorListeners = new Set<() => void>();
function setSyncError(next: SettingsSyncError) {
   if (next === syncError) return;
   syncError = next;
   errorListeners.forEach((fn) => fn());
}

/** Último erro de sincronização (`load`: GET falhou; `save`: PATCH falhou), ou null. */
export function getSettingsSyncError(): SettingsSyncError {
   return syncError;
}

/** Hook do erro de sincronização, para a UI de Settings avisar. */
export function useSettingsSyncError(): SettingsSyncError {
   return useSyncExternalStore(
      (fn) => {
         errorListeners.add(fn);
         return () => errorListeners.delete(fn);
      },
      getSettingsSyncError,
      () => null
   );
}

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

function notificationsSlice(): Partial<NotificationPrefs> {
   const n = useNotificationPrefsStore.getState();
   return {
      emailNotifications: n.emailNotifications,
      slackNotifications: n.slackNotifications,
      showUpdatesInSidebar: n.showUpdatesInSidebar,
      changelogNewsletter: n.changelogNewsletter,
      marketing: n.marketing,
      inviteAccepted: n.inviteAccepted,
      privacyLegal: n.privacyLegal,
   };
}

/** Só as seções pedidas (as outras o servidor preserva no merge). */
function sectionsSnapshot(sections: Iterable<Section>): SettingsBlob {
   const blob: SettingsBlob = {};
   for (const section of sections) {
      if (section === 'theme') blob.theme = themeSlice();
      else if (section === 'notifications') blob.notifications = notificationsSlice();
      else if (section === 'preferences') blob.preferences = preferencesSlice();
      else blob.layout = layoutSlice();
   }
   return fitToCap(blob);
}

const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 5_000;

function scheduleSave(section: Section, delay = SAVE_DEBOUNCE_MS) {
   // Sem GET bem-sucedido não grava (#15): o blob local sobrescreveria o do servidor.
   if (!ready) return;
   dirty.add(section);
   if (timer) clearTimeout(timer);
   timer = setTimeout(flush, delay);
}

function flush() {
   timer = null;
   if (!ready || dirty.size === 0) return;
   const sections = [...dirty];
   dirty.clear();
   api.settings
      .patch(sectionsSnapshot(sections) as Record<string, unknown>)
      .then(() => {
         if (dirty.size === 0) setSyncError(null);
      })
      .catch(() => {
         setSyncError('save');
         // Reenvia as mesmas seções (junto com o que mudou nesse meio-tempo).
         sections.forEach((section) => dirty.add(section));
         if (!timer) timer = setTimeout(flush, SAVE_RETRY_MS);
      });
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

/** Backoff do GET inicial: 5 s, 10 s, 20 s… até 60 s. */
function loadRetryDelay(): number {
   return Math.min(5_000 * 2 ** (loadAttempts - 1), 60_000);
}

async function load(): Promise<void> {
   loadAttempts += 1;
   try {
      const data = (await api.settings.get()) as SettingsBlob;
      applyTheme(data.theme);
      if (data.notifications) useNotificationPrefsStore.getState().hydratePrefs(data.notifications);
      if (data.preferences) usePreferencesStore.getState().hydratePrefs(data.preferences);
      applyLayout(data.layout);
      ready = true;
      setSyncError(null);
   } catch {
      // Sem GET não há gravação (#15): tenta de novo, e a UI mostra o erro.
      setSyncError('load');
      setTimeout(() => void load(), loadRetryDelay());
   }
}

/**
 * Carrega as settings do servidor e liga a gravação automática. Idempotente:
 * chamável várias vezes (só o primeiro boot roda). Nunca lança.
 */
export async function startUserSettingsSync(): Promise<void> {
   if (started) return;
   started = true;
   await load();
   // Assina DEPOIS de aplicar, pra não regravar o que acabou de carregar. Enquanto o
   // GET não der certo, `scheduleSave` ignora as mudanças.
   useThemeStore.subscribe(() => scheduleSave('theme'));
   useNotificationPrefsStore.subscribe(() => scheduleSave('notifications'));
   usePreferencesStore.subscribe(() => scheduleSave('preferences'));
   useDisplaySettingsStore.subscribe(() => scheduleSave('layout'));
   useViewTypeStore.subscribe(() => scheduleSave('layout'));
   useSidebarTeamsStore.subscribe(() => scheduleSave('layout'));
   useSidebarPrefsStore.subscribe(() => scheduleSave('layout'));
   useDetailPanelStore.subscribe(() => scheduleSave('layout'));
   useInboxLayoutStore.subscribe(() => scheduleSave('layout'));
}
