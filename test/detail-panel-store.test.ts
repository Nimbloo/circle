// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DETAIL_PANELS, useDetailPanelStore } from '@/store/detail-panel-store';

describe('detail-panel-store', () => {
   beforeEach(() => {
      useDetailPanelStore.setState({ openByKind: { ...DEFAULT_DETAIL_PANELS } });
   });

   it('começa aberto para os três tipos e alterna por tipo', () => {
      const s = useDetailPanelStore.getState();
      expect(s.openByKind).toEqual({ initiative: true, project: true, issue: true });
      s.toggle('project');
      expect(useDetailPanelStore.getState().openByKind.project).toBe(false);
      expect(useDetailPanelStore.getState().openByKind.initiative).toBe(true);
   });

   it('setOpen igual não recria o objeto; hydratePanels faz merge parcial', () => {
      const before = useDetailPanelStore.getState().openByKind;
      useDetailPanelStore.getState().setOpen('issue', true);
      expect(useDetailPanelStore.getState().openByKind).toBe(before);
      useDetailPanelStore.getState().hydratePanels({ initiative: false });
      expect(useDetailPanelStore.getState().openByKind).toEqual({
         initiative: false,
         project: true,
         issue: true,
      });
   });

   it('persiste só openByKind', () => {
      const raw = JSON.parse(localStorage.getItem('detail-panels') ?? '{}');
      expect(Object.keys(raw.state ?? {})).toEqual(['openByKind']);
   });
});
