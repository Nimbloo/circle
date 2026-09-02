// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isTeamOpen, useSidebarTeamsStore } from '@/store/sidebar-teams-store';

describe('sidebar-teams-store', () => {
   beforeEach(() => {
      useSidebarTeamsStore.setState({ openById: {} });
   });

   it('só o primeiro time começa aberto quando nada foi decidido', () => {
      const { openById } = useSidebarTeamsStore.getState();
      expect(isTeamOpen(openById, 'a', 0)).toBe(true);
      expect(isTeamOpen(openById, 'b', 1)).toBe(false);
   });

   it('lembra a decisão do usuário por time e não recria estado igual', () => {
      const store = useSidebarTeamsStore.getState();
      store.setOpen('b', true);
      store.setOpen('a', false);
      const after = useSidebarTeamsStore.getState();
      expect(isTeamOpen(after.openById, 'a', 0)).toBe(false);
      expect(isTeamOpen(after.openById, 'b', 1)).toBe(true);
      const ref = useSidebarTeamsStore.getState().openById;
      useSidebarTeamsStore.getState().setOpen('b', true);
      expect(useSidebarTeamsStore.getState().openById).toBe(ref);
   });

   it('persiste só openById', () => {
      const raw = JSON.parse(localStorage.getItem('sidebar-teams') ?? '{}');
      expect(Object.keys(raw.state ?? {})).toEqual(['openById']);
   });
});
