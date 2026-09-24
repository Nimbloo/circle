// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectLine from '@/components/common/projects/project-line';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';

/**
 * Auditoria de diálogos (15c): o diálogo aberto a partir de um item de menu devolvia o
 * foco ao ITEM (que desmontou com o menu) — o foco caía no <body> ao cancelar.
 */

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
   }),
});

vi.mock('@/lib/client', () => {
   class ApiError extends Error {}
   return { ApiError, api: { projects: { update: vi.fn(), remove: vi.fn() } } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/projects',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
   seedCatalog();
   useWorkspaceStore.setState({ loaded: true, users: [], teams: [], projects: [] });
});

describe('foco ao fechar diálogo aberto pelo menu', () => {
   it('ProjectLine: cancelar "Delete project" devolve o foco ao botão de ações', async () => {
      const user = userEvent.setup();
      render(<ProjectLine project={makeProject({ id: 'p1', name: 'Alpha' })} />);
      const trigger = screen.getByRole('button', { name: 'Project actions' });
      await user.click(trigger);
      await user.click(await screen.findByRole('menuitem', { name: /Delete project/ }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
   });
});
