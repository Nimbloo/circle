// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const get = vi.fn<() => Promise<Record<string, unknown>>>();
const put = vi.fn<(data: Record<string, unknown>) => Promise<Record<string, unknown>>>();

vi.mock('@/lib/client', () => ({
   api: {
      settings: {
         get: () => get(),
         put: (data: Record<string, unknown>) => put(data),
      },
   },
}));

const { startUserSettingsSync } = await import('@/lib/user-settings-sync');
const { SettingsSchema } = await import('@/lib/api/settings');
const { DEFAULT_DISPLAY_SETTINGS, useDisplaySettingsStore } = await import(
   '@/store/display-settings-store'
);
const { useViewTypeStore } = await import('@/store/view-store');
const { useSidebarTeamsStore } = await import('@/store/sidebar-teams-store');
const { useSidebarPrefsStore } = await import('@/store/sidebar-prefs-store');
const { useDetailPanelStore } = await import('@/store/detail-panel-store');
const { useInboxLayoutStore } = await import('@/store/inbox-layout-store');

const serverLayout = {
   displayByView: { 'my-issues': { grouping: 'assignee', displayProperties: { cycle: true } } },
   viewTypeByView: { 'team/ENG/all': 'grid' },
   sidebarTeams: { openById: { t1: false, t2: true } },
   sidebarPrefs: {
      badgeStyle: 'dot',
      visibility: { reviews: 'never' },
      order: { personal: ['my-issues', 'inbox', 'reviews'] },
   },
   detailPanels: { openByKind: { project: false } },
   inboxListWidth: 420,
};

// O módulo tem um boot só (`started`): os testes abaixo são uma sequência.
describe('user-settings-sync (layout)', () => {
   beforeAll(() => {
      vi.useFakeTimers();
   });
   afterAll(() => {
      vi.useRealTimers();
   });

   it('boot aplica o layout do servidor nos stores (servidor vence o localStorage)', async () => {
      // Estado local "antigo", que o servidor não conhece.
      useDisplaySettingsStore.getState().setGrouping('local-only', 'label');
      useViewTypeStore.getState().setViewType('local-only', 'grid');
      useSidebarTeamsStore.getState().setOpen('t9', true);
      useInboxLayoutStore.getState().setListWidth(333);

      get.mockResolvedValueOnce({ theme: { mode: 'dark' }, layout: serverLayout });
      put.mockResolvedValue({});
      await startUserSettingsSync();

      expect(useDisplaySettingsStore.getState().byView).toEqual({
         'my-issues': {
            ...DEFAULT_DISPLAY_SETTINGS,
            grouping: 'assignee',
            displayProperties: { ...DEFAULT_DISPLAY_SETTINGS.displayProperties, cycle: true },
         },
      });
      expect(useViewTypeStore.getState().viewTypeByView).toEqual({ 'team/ENG/all': 'grid' });
      expect(useSidebarTeamsStore.getState().openById).toEqual({ t1: false, t2: true });
      const sidebar = useSidebarPrefsStore.getState();
      expect(sidebar.badgeStyle).toBe('dot');
      expect(sidebar.visibility.reviews).toBe('never');
      expect(sidebar.visibility.inbox).toBe('always');
      expect(sidebar.order.personal).toEqual(['my-issues', 'inbox', 'reviews']);
      expect(useDetailPanelStore.getState().openByKind).toEqual({
         initiative: true,
         project: false,
         issue: true,
      });
      expect(useInboxLayoutStore.getState().listWidth).toBe(420);

      // Aplicar do servidor NÃO regrava (assina só depois de aplicar).
      await vi.advanceTimersByTimeAsync(1000);
      expect(put).not.toHaveBeenCalled();
   });

   it('mudança em um store de layout dispara settings.put com `layout` (debounce)', async () => {
      useViewTypeStore.getState().setViewType('my-issues', 'grid');
      useDisplaySettingsStore.getState().setOrdering('team/ENG/all', 'title');
      useDetailPanelStore.getState().toggle('issue');

      await vi.advanceTimersByTimeAsync(500);
      expect(put).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(put).toHaveBeenCalledTimes(1);

      const body = put.mock.calls[0][0] as { layout: Record<string, unknown> };
      expect(body.layout).toEqual({
         displayByView: {
            'my-issues': {
               ...DEFAULT_DISPLAY_SETTINGS,
               grouping: 'assignee',
               displayProperties: { ...DEFAULT_DISPLAY_SETTINGS.displayProperties, cycle: true },
            },
            'team/ENG/all': { ...DEFAULT_DISPLAY_SETTINGS, ordering: 'title' },
         },
         viewTypeByView: { 'team/ENG/all': 'grid', 'my-issues': 'grid' },
         sidebarTeams: { openById: { t1: false, t2: true } },
         sidebarPrefs: {
            badgeStyle: 'dot',
            visibility: useSidebarPrefsStore.getState().visibility,
            order: useSidebarPrefsStore.getState().order,
         },
         detailPanels: { openByKind: { initiative: true, project: false, issue: false } },
         inboxListWidth: 420,
      });
      // O que o cliente manda passa no schema fechado do servidor.
      expect(() => SettingsSchema.parse(body)).not.toThrow();
   });

   it('view de volta aos defaults sai do snapshot (reset = ausência)', async () => {
      useDisplaySettingsStore.getState().resetDisplaySettings('team/ENG/all');
      useViewTypeStore.getState().setViewType('my-issues', 'list');
      await vi.advanceTimersByTimeAsync(900);
      expect(put).toHaveBeenCalledTimes(2);
      const body = put.mock.calls[1][0] as { layout: Record<string, unknown> };
      expect(Object.keys(body.layout.displayByView as object)).toEqual(['my-issues']);
      expect(body.layout.viewTypeByView).toEqual({ 'team/ENG/all': 'grid' });
   });
});
