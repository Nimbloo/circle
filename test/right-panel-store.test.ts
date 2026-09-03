// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viewKeyFromPathname } from '@/lib/view-key';
import { useRightPanelBaseStore, useRightPanelStore } from '@/store/right-panel-store';

const nav = vi.hoisted(() => ({ pathname: '/nimbloo/team/ENG/all' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

describe('view-key', () => {
   it('remove o prefixo do org do pathname', () => {
      expect(viewKeyFromPathname('/nimbloo/team/ENG/all')).toBe('team/ENG/all');
      expect(viewKeyFromPathname('/nimbloo/my-issues')).toBe('my-issues');
      expect(viewKeyFromPathname('/nimbloo/project/p1/issues')).toBe('project/p1/issues');
      expect(viewKeyFromPathname('/nimbloo')).toBe('');
   });
});

describe('right-panel-store', () => {
   beforeEach(() => {
      nav.pathname = '/nimbloo/team/ENG/all';
      useRightPanelBaseStore.setState({ byRoute: {} });
   });

   it('abrir na rota A não abre na rota B', () => {
      const { result, rerender } = renderHook(() => useRightPanelStore());
      expect(result.current.openPanel).toBeNull();

      act(() => result.current.togglePanel('insights'));
      expect(result.current.openPanel).toBe('insights');

      nav.pathname = '/nimbloo/my-issues';
      rerender();
      expect(result.current.openPanel).toBeNull();

      nav.pathname = '/nimbloo/team/ENG/all';
      rerender();
      expect(result.current.openPanel).toBe('insights');
      expect(useRightPanelBaseStore.getState().byRoute).toEqual({ 'team/ENG/all': 'insights' });
   });

   it('toggle do mesmo painel na mesma rota fecha; openPanelOfType e closePanel', () => {
      const { result } = renderHook(() => useRightPanelStore());

      act(() => result.current.togglePanel('breakdown'));
      expect(result.current.openPanel).toBe('breakdown');
      act(() => result.current.togglePanel('breakdown'));
      expect(result.current.openPanel).toBeNull();

      act(() => result.current.openPanelOfType('cycle-details'));
      expect(result.current.openPanel).toBe('cycle-details');
      act(() => result.current.closePanel());
      expect(result.current.openPanel).toBeNull();
   });

   it('aceita selector e mantém as ações estáveis entre renders da mesma rota', () => {
      const { result, rerender } = renderHook(() => useRightPanelStore((s) => s.togglePanel));
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);

      act(() => first('insights'));
      const { result: open } = renderHook(() => useRightPanelStore((s) => s.openPanel));
      expect(open.current).toBe('insights');
   });
});
