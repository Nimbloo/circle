// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '@/components/layout/command-palette';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/lib/client', () => ({ api: { search: { query: apiMocks.search } } }));

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
   usePathname: () => '/nimbloo/team/ENG/all',
   useRouter: () => ({ push: routerMocks.push }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const issue: Issue = {
   id: 'a',
   identifier: 'ENG-1',
   title: 'Login quebrado',
   description: '',
   status: status[0],
   priority: priorities.find((p) => p.id === 'no-priority')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
};

const item = (over: Partial<Record<string, unknown>> & { id: string; title: string }) => ({
   identifier: null,
   snippet: '',
   rank: 1,
   teamId: null,
   statusId: null,
   url: '/',
   ...over,
});

async function openAndType(text: string) {
   const user = userEvent.setup({ pointerEventsCheck: 0 });
   render(<CommandPalette />);
   fireEvent.keyDown(window, { key: 'k', metaKey: true });
   const input = await screen.findByPlaceholderText(/Type a command or search/i);
   await user.type(input, text);
   return user;
}

describe('CommandPalette — busca full-text agrupada', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useIssuesStore.setState({ issues: [issue] });
      useWorkspaceStore.setState({ projects: [], users: [], cycles: [], teams: [] });
      apiMocks.search.mockResolvedValue({
         query: 'login',
         fallback: false,
         semantic: false,
         groups: [
            {
               type: 'issue',
               items: [
                  item({
                     id: 'a',
                     identifier: 'ENG-1',
                     title: 'Login quebrado',
                     snippet: 'falha no <mark>login</mark> do app',
                     url: '/issue/ENG-1',
                  }),
               ],
            },
            {
               type: 'initiative',
               items: [item({ id: 'n1', title: 'Login unificado', url: '/initiative/n1' })],
            },
            {
               type: 'document',
               items: [item({ id: 'd1', title: 'Runbook de login', url: '/team/ENG/documents' })],
            },
         ],
      });
   });

   it('consulta /search e mostra grupos de Initiatives e Documents com o snippet da issue', async () => {
      await openAndType('login');

      await waitFor(() => expect(apiMocks.search).toHaveBeenCalledWith({ q: 'login', limit: 6 }));
      expect(await screen.findByText('Initiatives')).toBeTruthy();
      expect(screen.getByText('Login unificado')).toBeTruthy();
      expect(screen.getByText('Documents')).toBeTruthy();
      expect(screen.getByText('Runbook de login')).toBeTruthy();

      const mark = document.querySelector('mark');
      expect(mark?.textContent).toBe('login');
   });

   it('Enter num resultado de document navega para a url do servidor', async () => {
      const user = await openAndType('login');
      await screen.findByText('Runbook de login');
      await user.click(screen.getByText('Runbook de login'));
      expect(routerMocks.push).toHaveBeenCalledWith('/nimbloo/team/ENG/documents');
   });

   it('falha do servidor não derruba a busca client-side', async () => {
      apiMocks.search.mockRejectedValue(new Error('boom'));
      await openAndType('login');
      expect(await screen.findByText('Login quebrado')).toBeTruthy();
      expect(screen.queryByText('Initiatives')).toBeNull();
   });
});
