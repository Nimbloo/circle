// @vitest-environment jsdom

import './setup-dom';
import React, { Profiler } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Inbox from '@/components/common/inbox/inbox';
import { NavInbox } from '@/components/layout/sidebar/nav-inbox';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore, type InboxNotification } from '@/store/notifications-store';

vi.mock('@/lib/client', () => ({ api: { inbox: {} } }));
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReviews: vi.fn(() => new Promise(() => {})),
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/inbox',
}));
vi.mock('@/components/common/inbox/issue-preview', () => ({ default: () => null }));
// Sonda: o ícone de status é desenhado uma vez por render de linha.
const statusIconCalls = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/status-utils', () => ({
   renderStatusIcon: (id: string) => {
      statusIconCalls.push(id);
      return null;
   },
}));

/**
 * #27: cada linha do inbox fazia `issues.find` por identifier (O(linhas × issues) a cada
 * evento) e o inbox/nav assinavam o notifications-store inteiro. Agora o mapa
 * identifier→status sai uma vez no pai, a linha é `memo` e o nav lê só `unreadCount`.
 */
const todo = status.find((s) => s.id === 'to-do')!;
const done = status.find((s) => s.id === 'done')!;

const makeIssue = (n: number): Issue => ({
   id: `i${n}`,
   identifier: `ENG-${n}`,
   title: `Issue ${n}`,
   description: '',
   status: todo,
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: `${n}`,
   teamId: 'ENG',
});

const makeNotification = (n: number): InboxNotification =>
   ({
      ...makeIssue(n),
      id: `n${n}`,
      type: 'comment',
      content: `comentário ${n}`,
      user: { id: 'u1', name: 'Ana Lima', avatarUrl: '' },
      timestamp: '2h',
      read: false,
      sortAt: `2026-09-${String(10 + n).padStart(2, '0')}T00:00:00.000Z`,
   }) as unknown as InboxNotification;

describe('inbox — re-render por evento', () => {
   beforeAll(() => {
      Object.defineProperty(window, 'matchMedia', {
         configurable: true,
         value: (query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            // motion (prefers-reduced-motion) ainda usa a API antiga.
            addListener: () => {},
            removeListener: () => {},
         }),
      });
   });

   beforeEach(() => {
      statusIconCalls.length = 0;
      useIssuesStore.setState({ issues: [makeIssue(1), makeIssue(2), makeIssue(99)] });
      useNotificationsStore.setState({
         notifications: [makeNotification(1), makeNotification(2)],
         snoozed: [],
         selectedNotification: undefined,
         unreadCount: 2,
         loaded: true,
      });
   });

   it('issue de fora do inbox muda: nenhuma linha re-renderiza; a da notificação acompanha', () => {
      render(
         <SidebarProvider>
            <Inbox />
         </SidebarProvider>
      );
      expect(screen.getByText('Issue 1')).toBeTruthy();
      statusIconCalls.length = 0;

      // Varreduras do array de issues por linha (`find` por identifier) a cada evento.
      const [a0, b0, c0] = useIssuesStore.getState().issues;
      const next = [a0, b0, { ...c0, title: 'Mudou' }];
      const originalFind = Array.prototype.find;
      let scans = 0;
      const spy = vi.spyOn(Array.prototype, 'find').mockImplementation(function (
         this: unknown[],
         ...args: Parameters<typeof originalFind>
      ) {
         if (this === next) scans++;
         return originalFind.apply(this, args);
      });
      act(() => useIssuesStore.setState({ issues: next }));
      spy.mockRestore();
      expect(scans).toBe(0);
      expect(statusIconCalls).toEqual([]);

      act(() => {
         const [a, b, c] = useIssuesStore.getState().issues;
         useIssuesStore.setState({ issues: [{ ...a, status: done }, b, c] });
      });
      expect(statusIconCalls).toEqual(['done']);
   });

   it('nav do inbox só re-renderiza quando a contagem de não lidas muda', () => {
      let commits = 0;
      render(
         <SidebarProvider>
            <Profiler id="nav" onRender={() => commits++}>
               <NavInbox />
            </Profiler>
         </SidebarProvider>
      );
      expect(screen.getByText('2')).toBeTruthy();
      commits = 0;

      act(() =>
         useNotificationsStore.setState({
            notifications: [makeNotification(1), { ...makeNotification(2), content: 'editado' }],
         })
      );
      expect(commits).toBe(0);

      act(() => useNotificationsStore.setState({ unreadCount: 1 }));
      expect(screen.getByText('1')).toBeTruthy();
   });
});
