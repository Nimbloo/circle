// @vitest-environment jsdom

import './setup-dom';
import React, { Profiler } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { IssueLine } from '@/components/common/issues/issue-line';
import { GroupIssues } from '@/components/common/issues/group-issues';
import type { Issue } from '@/data/issues';
import { labels } from '@/data/labels';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
// Sonda de render por linha: o badge de SLA é filho direto de cada linha.
const rowRenders: string[] = [];
vi.mock('@/components/common/issues/sla-badge', () => ({
   SlaBadge: ({ issue }: { issue: Issue }) => {
      rowRenders.push(issue.id);
      return null;
   },
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

/**
 * #1 da sanidade 2: cada linha da lista assinava `s.issues` nos seletores de
 * status/prioridade/label/projeto para contar as issues do dropdown — com o popover
 * FECHADO. Um evento SSE (1 issue muda) acordava todas as linhas visíveis e cada uma
 * varria as ~3k issues por opção. As contagens agora vivem dentro do popover aberto.
 */

const PROJECT = makeProject({ id: 'p1', name: 'Alpha', teamId: 'ENG' });
const todo = status.find((s) => s.id === 'to-do')!;
const noPriority = priorities.find((p) => p.id === 'no-priority')!;

const makeIssue = (id: string, over: Partial<Issue> = {}): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: `Issue ${id}`,
   description: '',
   status: todo,
   priority: noPriority,
   assignee: null,
   assignees: [],
   labels: [labels[0]],
   project: PROJECT,
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
   ...over,
});

describe('seletores da linha de issue — contagens só com o popover aberto', () => {
   beforeEach(() => {
      useWorkspaceStore.setState({ users: [], projects: [PROJECT], cycles: [] });
   });

   it('mudança numa issue do store não re-renderiza as outras linhas', () => {
      const rows = Array.from({ length: 20 }, (_, i) => makeIssue(`i${i}`));
      useIssuesStore.setState({ issues: rows });

      const commits = new Map<string, number>();
      const onRender = (id: string) => commits.set(id, (commits.get(id) ?? 0) + 1);
      // Pai estático (não assina o store): só re-renderiza linha que assina algo que mudou.
      render(
         <>
            {rows.map((issue) => (
               <Profiler key={issue.id} id={issue.id} onRender={onRender}>
                  <IssueLine issue={issue} />
               </Profiler>
            ))}
         </>
      );
      commits.clear();

      // Evento remoto: 1 issue muda (splice), array novo no store.
      act(() => {
         const next = [...useIssuesStore.getState().issues];
         next[0] = { ...next[0], title: 'Mudou' };
         useIssuesStore.setState({ issues: next });
      });

      expect([...commits.keys()]).toEqual([]);
   });

   it('ao abrir, o popover mostra as contagens atuais', async () => {
      const user = userEvent.setup();
      const high = priorities.find((p) => p.id === 'high')!;
      const issues = [
         makeIssue('a'),
         makeIssue('b', { priority: high, labels: [labels[0], labels[1]] }),
         makeIssue('c', { priority: high, project: undefined, labels: [] }),
      ];
      useIssuesStore.setState({ issues });
      render(<IssueLine issue={issues[0]} />);

      await user.click(screen.getByLabelText('Change priority: No priority'));
      const priorityItem = (await screen.findByText('High')).closest('[cmdk-item]') as HTMLElement;
      expect(within(priorityItem).getByText('2')).toBeTruthy();
      await user.keyboard('{Escape}');

      await user.click(screen.getByLabelText('Change labels'));
      const labelItem = (await screen.findByText(labels[1].name)).closest(
         '[cmdk-item]'
      ) as HTMLElement;
      expect(within(labelItem).getByText('1')).toBeTruthy();
      await user.keyboard('{Escape}');

      await user.click(screen.getByLabelText('Change project: Alpha'));
      const popover = document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
      const projectItem = within(popover)
         .getAllByText('Alpha')
         .map((el) => el.closest('[cmdk-item]'))
         .find(Boolean) as HTMLElement;
      expect(within(projectItem).getByText('2')).toBeTruthy();
   });

   it('lista do grupo: re-render do pai com array novo só acorda a linha que mudou', () => {
      const rows = Array.from({ length: 10 }, (_, i) => makeIssue(`g${i}`));
      useIssuesStore.setState({ issues: rows });

      function Harness() {
         const issues = useIssuesStore((s) => s.issues);
         return (
            <DndProvider backend={HTML5Backend}>
               <GroupIssues
                  group={{ id: 'to-do', name: 'Todo', icon: null, status: todo }}
                  issues={issues}
                  count={issues.length}
               />
            </DndProvider>
         );
      }
      render(<Harness />);
      rowRenders.length = 0;

      act(() => {
         const next = [...useIssuesStore.getState().issues];
         next[3] = { ...next[3], title: 'Mudou' };
         useIssuesStore.setState({ issues: next });
      });

      // `orderedIssues` novo a cada render derrubava o memo de TODAS as linhas do grupo.
      expect(rowRenders).toEqual(['g3']);
   });
});
