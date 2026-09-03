// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const nav = { pathname: '/acme/team/ENG/all' };

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'acme' }),
   usePathname: () => nav.pathname,
}));

const {
   DEFAULT_DISPLAY_SETTINGS,
   isDefaultDisplaySettings,
   useDisplaySetting,
   useDisplaySettings,
   useDisplaySettingsStore,
} = await import('@/store/display-settings-store');
const { useViewStore, useViewTypeStore } = await import('@/store/view-store');

describe('display-settings-store (por view)', () => {
   beforeEach(() => {
      useDisplaySettingsStore.setState({ byView: {} });
      useViewTypeStore.setState({ viewTypeByView: {} });
      nav.pathname = '/acme/team/ENG/all';
   });

   it('view nunca tocada devolve os defaults (mesma referência)', () => {
      const { result } = renderHook(() => useDisplaySettings());
      expect(result.current.grouping).toBe('status');
      expect(result.current.displayProperties).toBe(DEFAULT_DISPLAY_SETTINGS.displayProperties);
      expect(isDefaultDisplaySettings(result.current)).toBe(true);
   });

   it('mudar uma view não vaza para outra', () => {
      const store = useDisplaySettingsStore.getState();
      store.setGrouping('team/ENG/all', 'assignee');
      store.toggleDisplayProperty('team/ENG/all', 'cycle');
      store.setOrdering('my-issues', 'created');

      const eng = renderHook(() => useDisplaySettings()).result.current;
      expect(eng.grouping).toBe('assignee');
      expect(eng.ordering).toBe('priority');
      expect(eng.displayProperties.cycle).toBe(true);

      nav.pathname = '/acme/my-issues';
      const mine = renderHook(() => useDisplaySettings()).result.current;
      expect(mine.grouping).toBe('status');
      expect(mine.ordering).toBe('created');
      expect(mine.displayProperties.cycle).toBe(false);
   });

   it('os setters do hook atuam na view atual; reset limpa só ela', () => {
      const { result } = renderHook(() => useDisplaySettings());
      act(() => {
         result.current.setGrouping('project');
         result.current.setShowEmptyGroups(true);
      });
      expect(result.current.grouping).toBe('project');
      expect(result.current.showEmptyGroups).toBe(true);
      useDisplaySettingsStore.getState().setCompletedIssues('my-issues', 'none');

      act(() => result.current.resetDisplaySettings());
      expect(result.current.grouping).toBe('status');
      expect(isDefaultDisplaySettings(result.current)).toBe(true);
      expect(useDisplaySettingsStore.getState().byView['team/ENG/all']).toBeUndefined();
      expect(useDisplaySettingsStore.getState().byView['my-issues']?.completedIssues).toBe('none');
   });

   it('useDisplaySetting assina uma chave só', () => {
      const { result } = renderHook(() => useDisplaySetting('ordering'));
      expect(result.current).toBe('priority');
      act(() => useDisplaySettingsStore.getState().setOrdering('team/ENG/all', 'title'));
      expect(result.current).toBe('title');
   });

   it('hydrateByView substitui o mapa e completa/valida cada view', () => {
      useDisplaySettingsStore.getState().setGrouping('local-only', 'label');
      useDisplaySettingsStore.getState().hydrateByView({
         'my-issues': { grouping: 'priority', displayProperties: { cycle: true } as never },
         'bad': { grouping: 'nope' as never },
      });
      const { byView } = useDisplaySettingsStore.getState();
      expect(byView['local-only']).toBeUndefined();
      expect(byView['my-issues'].grouping).toBe('priority');
      expect(byView['my-issues'].displayProperties).toEqual({
         ...DEFAULT_DISPLAY_SETTINGS.displayProperties,
         cycle: true,
      });
      expect(byView['bad'].grouping).toBe('status');
   });

   it('migrate v0→v1 descarta o estado flat antigo', async () => {
      localStorage.setItem(
         'display-settings',
         JSON.stringify({
            state: { grouping: 'assignee', ordering: 'created', showEmptyGroups: true },
            version: 0,
         })
      );
      await useDisplaySettingsStore.persist.rehydrate();
      expect(useDisplaySettingsStore.getState().byView).toEqual({});
      const raw = JSON.parse(localStorage.getItem('display-settings') ?? '{}');
      expect(raw.version).toBe(1);
      expect(Object.keys(raw.state)).toEqual(['byView']);
   });

   it('merge v1 completa novas display properties da view salva', async () => {
      localStorage.setItem(
         'display-settings',
         JSON.stringify({
            state: {
               byView: { 'my-issues': { grouping: 'none', displayProperties: { id: false } } },
            },
            version: 1,
         })
      );
      await useDisplaySettingsStore.persist.rehydrate();
      const view = useDisplaySettingsStore.getState().byView['my-issues'];
      expect(view.grouping).toBe('none');
      expect(view.displayProperties).toEqual({
         ...DEFAULT_DISPLAY_SETTINGS.displayProperties,
         id: false,
      });
   });
});

describe('view-store (list/board por view)', () => {
   beforeEach(() => {
      useViewTypeStore.setState({ viewTypeByView: {} });
      nav.pathname = '/acme/team/ENG/all';
   });

   it('mantém a API { viewType, setViewType } escopada à view atual', () => {
      const { result } = renderHook(() => useViewStore());
      expect(result.current.viewType).toBe('list');
      act(() => result.current.setViewType('grid'));
      expect(result.current.viewType).toBe('grid');

      nav.pathname = '/acme/my-issues';
      expect(renderHook(() => useViewStore()).result.current.viewType).toBe('list');
   });

   it('migrate v0→v1 descarta o viewType global; hydrate valida valores', async () => {
      localStorage.setItem(
         'view-storage',
         JSON.stringify({ state: { viewType: 'grid' }, version: 0 })
      );
      await useViewTypeStore.persist.rehydrate();
      expect(useViewTypeStore.getState().viewTypeByView).toEqual({});

      useViewTypeStore.getState().hydrateByView({ a: 'grid', b: 'weird' as never });
      expect(useViewTypeStore.getState().viewTypeByView).toEqual({ a: 'grid' });
   });
});
