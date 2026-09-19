// @vitest-environment jsdom

import './setup-dom';
import React, { Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { MeDto } from '@/lib/api/users';

const apiMocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/lib/client', () => ({ api: { search: { query: apiMocks.search } } }));
const nav = vi.hoisted(() => ({ pathname: '/nimbloo/team/ENG/all' }));
vi.mock('next/navigation', () => ({
   usePathname: () => nav.pathname,
   useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CommandPalette } from '@/components/layout/command-palette';

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

const initiativeGroup = (title: string) => ({
   query: '',
   fallback: false,
   semantic: false,
   groups: [
      {
         type: 'initiative',
         items: [
            {
               id: title,
               identifier: null,
               title,
               snippet: '',
               rank: 1,
               teamId: null,
               statusId: null,
               url: '/',
            },
         ],
      },
   ],
});

beforeEach(() => {
   vi.clearAllMocks();
   nav.pathname = '/nimbloo/team/ENG/all';
   useIssuesStore.setState({ issues: [issue] });
   useWorkspaceStore.setState({
      projects: [],
      users: [],
      cycles: [],
      teams: [],
      me: null,
   });
});

describe('command palette (#51)', () => {
   it('fechada não re-renderiza com mudança de issues', () => {
      let commits = 0;
      render(
         <Profiler id="palette" onRender={() => commits++}>
            <CommandPalette />
         </Profiler>
      );
      commits = 0;
      act(() => useIssuesStore.setState({ issues: [{ ...issue, title: 'Outro' }] }));
      expect(commits).toBe(0);
   });

   it('resultado de busca antiga não aparece na busca nova', async () => {
      let resolveOld!: (v: unknown) => void;
      apiMocks.search
         .mockResolvedValueOnce(initiativeGroup('Iniciativa ab'))
         .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
         .mockResolvedValueOnce(initiativeGroup('Iniciativa nova'));
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
      const input = await screen.findByPlaceholderText(/Digite um comando ou pesquise/i);
      await user.type(input, 'ab');
      await screen.findByText('Iniciativa ab');
      // Digitou mais: o resultado de "ab" não vale para "abc" (antes ficava misturado).
      await user.type(input, 'c');
      expect(screen.queryByText('Iniciativa ab')).toBeNull();
      await waitFor(() => expect(apiMocks.search).toHaveBeenCalledTimes(2));
      await user.type(input, 'd');
      await screen.findByText('Iniciativa nova');
      // A resposta atrasada de "abc" chega depois da de "abcd": descartada.
      await act(async () => resolveOld(initiativeGroup('Iniciativa velha')));
      expect(screen.queryByText('Iniciativa velha')).toBeNull();
      expect(screen.getByText('Iniciativa nova')).toBeTruthy();
   });

   it('"Copy git branch name" usa o usuário atual', async () => {
      nav.pathname = '/nimbloo/issue/ENG-1';
      useWorkspaceStore.setState({
         users: [{ id: 'outra-pessoa' } as never],
         me: { id: 'u-me', slug: 'danilo', githubLogin: null } as unknown as MeDto,
      });
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      // Depois do setup: o userEvent instala o próprio clipboard.
      const writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
      await user.click(await screen.findByText('Copy git branch name'));
      expect(writeText).toHaveBeenCalledWith('danilo/eng-1-login-quebrado');
   });
});
