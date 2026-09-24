// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewDetails from '@/components/common/views/view-details';
import ViewHeader from '@/components/layout/headers/view/header';
import { SidebarProvider } from '@/components/ui/sidebar';

// SidebarProvider (useIsMobile) consulta matchMedia, ausente no jsdom.
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
   }),
});
import type { Issue } from '@/data/issues';
import type { View } from '@/data/views';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useSavedSearchStore } from '@/store/saved-search-store';

const searchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({ api: { search: { query: searchMock }, issues: {} } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', viewId: 'v1' }),
   usePathname: () => '/nimbloo/views/v1',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
vi.mock('@tanstack/react-virtual', () => ({
   useVirtualizer: (opts: { count: number; getItemKey?: (i: number) => React.Key }) => ({
      getTotalSize: () => opts.count * 44,
      getVirtualItems: () =>
         Array.from({ length: opts.count }, (_, index) => ({
            index,
            key: opts.getItemKey ? opts.getItemKey(index) : index,
            start: index * 44,
         })),
      measureElement: () => {},
      scrollToIndex: () => {},
   }),
}));

const make = (n: number): Issue => ({
   id: `i${n}`,
   identifier: `ENG-${n}`,
   title: `Bug ${n}`,
   description: '',
   status: status.find((s) => s.id === 'to-do')!,
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: `a${n}`,
   teamId: 'ENG',
});

const view = {
   id: 'v1',
   name: 'Bugs',
   description: '',
   icon: '',
   type: 'issue',
   createdAt: '2026-09-01T00:00:00Z',
   updatedAt: '2026-09-01T00:00:00Z',
   filter: { q: 'bug' },
} as View;

const result = (ids: string[]) => ({
   groups: [{ type: 'issue', items: ids.map((id) => ({ id })) }],
});

beforeEach(() => {
   seedCatalog();
   vi.clearAllMocks();
   useDisplaySettingsStore.setState({ byView: {} });
   useSavedSearchStore.setState({ byKey: {} });
   useWorkspaceStore.setState({ views: [view], loaded: true, users: [], projects: [], teams: [] });
   useIssuesStore.setState({
      issues: [make(1), make(2)],
      loaded: true,
      loading: false,
      error: false,
   });
});

describe('Is#19/Ad#15 saved search', () => {
   it('enquanto a busca não volta, mostra carregando (sem flash de "Nenhuma issue")', () => {
      searchMock.mockReturnValue(new Promise(() => {}));
      render(<ViewDetails viewId="v1" />);
      expect(screen.getByTestId('issues-loading')).toBeTruthy();
      expect(screen.queryByText('Nenhuma issue')).toBeNull();
   });

   it('falha na busca mostra erro com retry, e o retry busca de novo', async () => {
      searchMock.mockRejectedValueOnce(new Error('x')).mockResolvedValue(result(['i2']));
      render(<ViewDetails viewId="v1" />);
      const retry = await screen.findByText('Tentar de novo');
      await userEvent.setup().click(retry);
      expect(await screen.findByText('Bug 2')).toBeTruthy();
      expect(screen.queryByText('Bug 1')).toBeNull();
   });

   it('mudança nas issues (evento) refaz a busca sem voltar ao carregando', async () => {
      searchMock.mockResolvedValueOnce(result(['i1'])).mockResolvedValue(result(['i1', 'i3']));
      render(<ViewDetails viewId="v1" />);
      expect(await screen.findByText('Bug 1')).toBeTruthy();

      act(() => useIssuesStore.setState((s) => ({ issues: [...s.issues, make(3)] })));
      expect(screen.getByText('Bug 1')).toBeTruthy(); // mantém o resultado anterior
      await waitFor(() => expect(screen.getByText('Bug 3')).toBeTruthy(), { timeout: 2000 });
      expect(searchMock).toHaveBeenCalledTimes(2);
   });

   it('o contador do header é o mesmo número de issues do corpo (aplica o termo)', async () => {
      searchMock.mockResolvedValue(result(['i2']));
      render(
         <SidebarProvider>
            <ViewHeader />
            <ViewDetails viewId="v1" />
         </SidebarProvider>
      );
      expect(await screen.findByText('Bug 2')).toBeTruthy();
      expect(screen.getByText('1 issues')).toBeTruthy();
   });

   it('o header não afirma "0 issues" enquanto a busca carrega', () => {
      searchMock.mockReturnValue(new Promise(() => {}));
      render(
         <SidebarProvider>
            <ViewHeader />
            <ViewDetails viewId="v1" />
         </SidebarProvider>
      );
      expect(screen.queryByText('0 issues')).toBeNull();
      expect(screen.getByText('– issues')).toBeTruthy();
   });

   it('o header não afirma "0 issues" depois que a busca falha', async () => {
      searchMock.mockRejectedValue(new Error('x'));
      render(
         <SidebarProvider>
            <ViewHeader />
            <ViewDetails viewId="v1" />
         </SidebarProvider>
      );
      await screen.findByText('Tentar de novo');
      expect(screen.queryByText('0 issues')).toBeNull();
      expect(screen.getByText('– issues')).toBeTruthy();
   });

   it('na ordenação padrão mantém a ordem de relevância da busca', async () => {
      const urgent = priorities.find((p) => p.id === 'urgent')!;
      const low = priorities.find((p) => p.id === 'low')!;
      useIssuesStore.setState({
         issues: [
            { ...make(1), priority: urgent },
            { ...make(2), priority: low },
         ],
      });
      searchMock.mockResolvedValue(result(['i2', 'i1']));
      render(<ViewDetails viewId="v1" />);
      await screen.findByText('Bug 2');
      const titles = screen.getAllByText(/^Bug \d$/).map((el) => el.textContent);
      expect(titles).toEqual(['Bug 2', 'Bug 1']);
   });

   it('busca que bate no teto de 100 avisa que mostra só os primeiros', async () => {
      const many = Array.from({ length: 100 }, (_, i) => make(i + 1));
      useIssuesStore.setState({ issues: many });
      searchMock.mockResolvedValue(result(many.map((i) => i.id)));
      render(<ViewDetails viewId="v1" />);
      expect(await screen.findByText(/Showing the first 100 matches/)).toBeTruthy();
   });

   it('abaixo do teto não mostra o aviso', async () => {
      searchMock.mockResolvedValue(result(['i1']));
      render(<ViewDetails viewId="v1" />);
      await screen.findByText('Bug 1');
      expect(screen.queryByText(/Showing the first 100 matches/)).toBeNull();
   });
});
