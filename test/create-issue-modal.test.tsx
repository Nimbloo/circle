// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewIssue } from '@/components/layout/sidebar/create-new-issue';
import { CreateIssueModalProvider } from '@/components/common/issues/create-issue-modal-provider';
import { OrgSwitcher } from '@/components/layout/sidebar/org-switcher';
import { SidebarProvider } from '@/components/ui/sidebar';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useCatalogStore } from '@/store/catalog-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({
   api: { teams: { templates: vi.fn(async () => []) }, issues: { create: createMock } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
// Editor real (Tiptap) é pesado e irrelevante aqui: um marcador conta as instâncias.
vi.mock('@/components/common/editor/block-editor', () => ({
   BlockEditor: () => <div data-testid="block-editor" />,
}));

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

const titleInput = () => screen.getByPlaceholderText('Título da issue') as HTMLInputElement;

describe('modal de criar issue', () => {
   beforeEach(() => {
      seedCatalog();
      act(() => useCreateIssueStore.setState({ isOpen: false, defaultStatus: null }));
      useWorkspaceStore.setState({ teams: [], users: [], projects: [], me: null });
   });

   it('#2 re-hidratar o catálogo com o modal aberto não apaga o que foi digitado', async () => {
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());

      await user.type(titleInput(), 'Título em andamento');

      // Evento remoto re-hidrata o workspace: catálogos com referências novas.
      act(() =>
         useCatalogStore.setState((s) => ({
            statuses: s.statuses.map((st) => ({ ...st })),
            priorities: s.priorities.map((p) => ({ ...p })),
         }))
      );
      act(() => useWorkspaceStore.setState({ teams: [] }));

      expect(titleInput().value).toBe('Título em andamento');
   });

   it('Is#17 fechar e reabrir preserva o rascunho; o "+" de uma coluna aplica o status', async () => {
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      await user.type(titleInput(), 'Rascunho');

      act(() => useCreateIssueStore.getState().closeModal());
      const inProgress = status.find((s) => s.id === 'in-progress')!;
      act(() => useCreateIssueStore.getState().openModal(inProgress));

      expect(titleInput().value).toBe('Rascunho');
      // Trigger do seletor de status (combobox não tira o nome do conteúdo).
      expect(screen.getByText('In Progress').closest('[role="combobox"]')).toBeTruthy();
   });

   it('Is#17 status padrão é o 1º status "unstarted" do catálogo, não um id fixo', () => {
      const custom = { ...status.find((s) => s.id === 'to-do')!, id: 'ready', name: 'Ready' };
      const prev = useCatalogStore.getState().statuses;
      act(() =>
         useCatalogStore.setState({ statuses: [custom, ...prev.filter((s) => s.id !== 'to-do')] })
      );
      try {
         render(<CreateNewIssue />);
         act(() => useCreateIssueStore.getState().openModal());
         expect(screen.getByText('Ready').closest('[role="combobox"]')).toBeTruthy();
      } finally {
         act(() => useCatalogStore.setState({ statuses: prev }));
      }
   });

   it('Is#17 ⌘Enter cria a issue; a otimista não carrega identifier inventado', async () => {
      let optimisticIdentifier: string | undefined;
      createMock.mockImplementation(async () => {
         optimisticIdentifier = useIssuesStore.getState().issues.at(-1)?.identifier;
         throw new Error('offline');
      });
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      await user.type(titleInput(), 'Nova');
      await user.keyboard('{Meta>}{Enter}{/Meta}');

      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
      expect(optimisticIdentifier).toBe('');
   });

   it('Is#17 criar com sucesso limpa o rascunho', async () => {
      createMock.mockImplementation(async (input: { title: string }) => ({
         id: 'srv-1',
         identifier: 'ENG-1',
         teamId: 'ENG',
         title: input.title,
         status: { id: 'to-do', name: 'Todo', color: '#000', category: 'unstarted' },
         priority: { id: 'no-priority', name: 'No priority' },
         assignee: null,
         assignees: [],
         labels: [],
         createdAt: '2026-01-01T00:00:00.000Z',
         updatedAt: '2026-01-01T00:00:00.000Z',
         cycleId: '',
         rank: 'a',
      }));
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      await user.type(titleInput(), 'Feita');
      await user.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(useCreateIssueStore.getState().isOpen).toBe(false));

      act(() => useCreateIssueStore.getState().openModal());
      expect(titleInput().value).toBe('');
   });

   it('#5 o botão da sidebar abre UMA instância do modal (a do provider)', async () => {
      const user = userEvent.setup();
      render(
         <SidebarProvider>
            <OrgSwitcher />
            <CreateIssueModalProvider />
         </SidebarProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Create new issue' }));

      expect(useCreateIssueStore.getState().isOpen).toBe(true);
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getAllByTestId('block-editor')).toHaveLength(1);
   });
});
