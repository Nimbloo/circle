// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectLine from '@/components/common/projects/project-line';
import { priorities } from '@/data/priorities';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';

const apiMocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@/lib/client', () => ({
   api: { projects: { update: apiMocks.update, remove: vi.fn() } },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/projects',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const PROJECT = makeProject({ id: 'p1', name: 'Alpha' });

/** Trigger do status (mostra ícone + percentual). */
const statusTrigger = () => screen.getByRole('combobox', { name: 'Set status' });

const option = (name: string) => screen.getByRole('option', { name: new RegExp(name) });

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
         matches: false,
         media: query,
         addEventListener: () => {},
         removeEventListener: () => {},
         addListener: () => {},
         removeListener: () => {},
      }),
   });
   useWorkspaceStore.setState({ projects: [PROJECT], teams: [], users: [] });
});

describe('ProjectLine — pickers (Pl#22)', () => {
   it('re-selecionar o status ou a prioridade atuais não faz PATCH', async () => {
      render(<ProjectLine project={PROJECT} />);

      fireEvent.click(statusTrigger());
      fireEvent.click(option('Backlog'));

      fireEvent.click(screen.getByRole('combobox', { name: 'Set priority' }));
      fireEvent.click(option(priorities[0].name));

      await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
      expect(apiMocks.update).not.toHaveBeenCalled();
   });

   it('status volta ao valor do servidor quando o PATCH falha', async () => {
      apiMocks.update.mockRejectedValue(new Error('boom'));
      render(<ProjectLine project={PROJECT} />);

      fireEvent.click(statusTrigger());
      fireEvent.click(option('In Progress'));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('option')).toBeNull());

      fireEvent.click(statusTrigger());
      const checked = (name: string) =>
         within(option(name)).queryByText(
            (_, el) => el?.tagName === 'svg' && /lucide-check/.test(el.getAttribute('class') ?? '')
         );
      await waitFor(() => expect(checked('Backlog')).toBeTruthy());
      expect(checked('In Progress')).toBeNull();
   });
});
