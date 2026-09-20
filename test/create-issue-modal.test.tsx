// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewIssue } from '@/components/layout/sidebar/create-new-issue';
import { CreateIssueModalProvider } from '@/components/common/issues/create-issue-modal-provider';
import { OrgSwitcher } from '@/components/layout/sidebar/org-switcher';
import { SidebarProvider } from '@/components/ui/sidebar';
import { status } from '@/data/status';
import { useCatalogStore } from '@/store/catalog-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('@/lib/client', () => ({
   api: { teams: { templates: vi.fn(async () => []) }, issues: {} },
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

   it('#2 fechar e reabrir começa um formulário novo (com o status padrão do "+")', async () => {
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      await user.type(titleInput(), 'Rascunho');

      act(() => useCreateIssueStore.getState().closeModal());
      const inProgress = status.find((s) => s.id === 'in-progress')!;
      act(() => useCreateIssueStore.getState().openModal(inProgress));

      expect(titleInput().value).toBe('');
      // Trigger do seletor de status (combobox não tira o nome do conteúdo).
      expect(screen.getByText('In Progress').closest('[role="combobox"]')).toBeTruthy();
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
