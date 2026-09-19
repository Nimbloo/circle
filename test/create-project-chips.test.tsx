// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject, toProjectDto } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';

const apiMocks = vi.hoisted(() => ({
   projectTemplates: vi.fn(async () => []),
   create: vi.fn(),
}));

vi.mock('@/components/common/editor/block-editor', () => ({ BlockEditor: () => null }));
vi.mock('@/lib/client', () => ({
   api: { teams: { projectTemplates: apiMocks.projectTemplates }, projects: { create: apiMocks.create } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/projects',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { CreateProjectButton } from '@/components/common/projects/create-project-dialog';

beforeEach(() => {
   apiMocks.projectTemplates.mockClear();
   apiMocks.create.mockReset();
   useWorkspaceStore.setState({ teams: [], users: [], initiatives: [] });
});

describe('Create project — chips de propriedade (Pl#20)', () => {
   it('chips são botões focáveis que abrem o popover', async () => {
      render(<CreateProjectButton />);
      fireEvent.click(screen.getByRole('button', { name: /Create project/ }));

      const lead = await screen.findByRole('button', { name: /Lead/ });
      expect(lead.tagName).toBe('BUTTON');
      expect(lead.getAttribute('aria-haspopup')).toBe('dialog');
      lead.focus();
      expect(document.activeElement).toBe(lead);

      fireEvent.click(lead);
      expect(lead.getAttribute('aria-expanded')).toBe('true');
   });
});

describe('Create project — rascunho e atalhos (pl#19)', () => {
   it('Esc fecha sem descartar o rascunho: reabrir mantém o que foi digitado', () => {
      render(<CreateProjectButton />);
      fireEvent.click(screen.getByRole('button', { name: /Create project/ }));
      fireEvent.change(screen.getByPlaceholderText('Project name'), {
         target: { value: 'Atlas' },
      });

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.queryByPlaceholderText('Project name')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Create project/ }));
      expect((screen.getByPlaceholderText('Project name') as HTMLInputElement).value).toBe('Atlas');
   });

   it('⌘Enter cria o projeto, como no modal de issue', async () => {
      seedCatalog();
      const created = makeProject({ id: 'p1', name: 'Atlas' });
      apiMocks.create.mockResolvedValue(toProjectDto(created));
      useWorkspaceStore.setState({
         teams: [{ id: 't1', name: 'Eng', color: '#000' } as never],
         users: [],
         initiatives: [],
      });
      render(<CreateProjectButton />);
      fireEvent.click(screen.getByRole('button', { name: /Create project/ }));
      fireEvent.change(screen.getByPlaceholderText('Project name'), {
         target: { value: 'Atlas' },
      });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(apiMocks.create).toHaveBeenCalledTimes(1));
      expect(apiMocks.create.mock.calls[0][0]).toMatchObject({ name: 'Atlas', teamId: 't1' });
   });
});
