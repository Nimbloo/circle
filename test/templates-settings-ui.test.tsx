// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const apiMocks = vi.hoisted(() => ({ templates: vi.fn(), projectTemplates: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { teams: { templates: apiMocks.templates, projectTemplates: apiMocks.projectTemplates } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: IssueTemplatesSettings } = await import(
   '@/components/common/settings/issue-templates-settings'
);
const { default: ProjectTemplatesSettings } = await import(
   '@/components/common/settings/project-templates-settings'
);
const { SidebarProvider } = await import('@/components/ui/sidebar');
const { CATALOG_CHANGED_EVENT } = await import('@/lib/use-live-sync');

const wrap = (el: React.ReactElement) => render(<SidebarProvider>{el}</SidebarProvider>);

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({
      teams: [{ id: 'CORE', name: 'Core', icon: '' }] as never,
      me: { id: 'me', admin: true } as never,
   });
});

describe('templates: erro não vira vazio falso (#57)', () => {
   it('issue templates: falha de carga mostra erro com retry, não "Nenhum template"', async () => {
      apiMocks.templates.mockRejectedValueOnce(new Error('rede'));
      wrap(<IssueTemplatesSettings />);
      await screen.findByText(/Não foi possível carregar os templates/);
      expect(screen.queryByText('Nenhum template ainda')).toBeNull();
      apiMocks.templates.mockResolvedValueOnce([{ id: 't1', name: 'Bug', title: null }]);
      act(() => screen.getByRole('button', { name: 'Tentar novamente' }).click());
      await screen.findByText('Bug');
   });

   it('project templates: falha de carga mostra erro, não vazio', async () => {
      apiMocks.projectTemplates.mockRejectedValueOnce(new Error('rede'));
      wrap(<ProjectTemplatesSettings />);
      await screen.findByText(/Não foi possível carregar os templates/);
      expect(screen.queryByText('Nenhum template ainda')).toBeNull();
   });

   it('evento de template de outro admin recarrega a lista do time', async () => {
      apiMocks.templates.mockResolvedValueOnce([]);
      wrap(<IssueTemplatesSettings />);
      await waitFor(() => expect(apiMocks.templates).toHaveBeenCalledTimes(1));
      apiMocks.templates.mockResolvedValueOnce([{ id: 't2', name: 'Feature', title: null }]);
      act(() => {
         window.dispatchEvent(
            new CustomEvent(CATALOG_CHANGED_EVENT, {
               detail: { id: 't2', teamId: 'CORE', kind: 'template' },
            })
         );
      });
      await screen.findByText('Feature');
   });
});
