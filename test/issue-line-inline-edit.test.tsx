// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { IssueLine } from '@/components/common/issues/issue-line';
import type { Issue } from '@/data/issues';
import { labels } from '@/data/labels';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import type { User } from '@/data/users';
import { firstRank, rankAfter } from '@/lib/api/rank';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { lastTestBackend } from './helpers/dnd-test-backend';
import { makeProject } from './helpers/project-fixture';

const apiMocks = vi.hoisted(() => ({
   update: vi.fn(),
   addLabel: vi.fn(),
   removeLabel: vi.fn(),
   reorder: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      issues: {
         update: apiMocks.update,
         addLabel: apiMocks.addLabel,
         removeLabel: apiMocks.removeLabel,
         reorder: apiMocks.reorder,
      },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
// Backend de teste no lugar do HTML5 (jsdom não tem drag nativo).
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const ANA: User = {
   id: 'u1',
   name: 'Ana',
   avatarUrl: '',
   email: 'ana@nimbloo.ai',
   status: 'online',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: ['ENG'],
   timezone: 'UTC',
};
const PROJECT = makeProject({ id: 'p1', name: 'Alpha' });
const todo = status.find((s) => s.id === 'to-do')!;
const inProgress = status.find((s) => s.id === 'in-progress')!;

const makeIssue = (over: Partial<Issue> & { id: string }): Issue => ({
   identifier: `ENG-${over.id}`,
   title: `Issue ${over.id}`,
   description: '',
   status: todo,
   priority: priorities.find((p) => p.id === 'no-priority')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: over.id,
   teamId: 'ENG',
   ...over,
});

/** A linha lê a issue do store — como as listas reais (re-render após a mutação). */
function Row({ id, orderedIssues }: { id: string; orderedIssues?: Issue[] }) {
   const issue = useIssuesStore((s) => s.issues.find((i) => i.id === id));
   if (!issue) return null;
   return <IssueLine issue={issue} orderedIssues={orderedIssues} />;
}

const storeIssue = (id: string) => useIssuesStore.getState().getIssueById(id)!;

describe('IssueLine — edição inline pelos seletores', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      apiMocks.update.mockImplementation(async () => ({}));
      apiMocks.addLabel.mockImplementation(async () => ({}));
      apiMocks.removeLabel.mockImplementation(async () => ({}));
      useWorkspaceStore.setState({ users: [ANA], projects: [PROJECT], cycles: [] });
      useIssuesStore.setState({
         issues: [makeIssue({ id: 'a', title: 'Alpha issue', project: PROJECT })],
      });
   });

   it('status: escolher no popover atualiza o store e faz PATCH do statusId', async () => {
      const user = userEvent.setup();
      render(<Row id="a" />);
      await user.click(screen.getByLabelText('Set status'));
      await user.click(await screen.findByText(inProgress.name));

      expect(storeIssue('a').status.id).toBe('in-progress');
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('a', { statusId: 'in-progress' })
      );
   });

   it('prioridade: a linha re-renderiza com a nova prioridade', async () => {
      const user = userEvent.setup();
      render(<Row id="a" />);
      await user.click(screen.getByLabelText('Change priority: No priority'));
      await user.click(await screen.findByText('High'));

      expect(screen.getByLabelText('Change priority: High')).toBeTruthy();
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('a', { priorityId: 'high' })
      );
   });

   it('assignee: o menu abre (não navega) e persiste o assigneeId', async () => {
      const user = userEvent.setup();
      render(<Row id="a" />);
      await user.click(screen.getByLabelText('Assign issue'));
      await user.click(await screen.findByText('Ana'));

      expect(screen.getByLabelText('Change assignee: Ana')).toBeTruthy();
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('a', { assigneeId: 'u1' }));
   });

   it('labels: o badge abre o seletor; marcar adiciona e desmarcar remove', async () => {
      const user = userEvent.setup();
      const [first, second] = labels;
      useIssuesStore.setState({ issues: [makeIssue({ id: 'a', labels: [first] })] });
      render(<Row id="a" />);

      await user.click(screen.getByLabelText('Change labels'));
      const dialog = document.querySelector<HTMLElement>(
         '[data-slot="popover-content"], [role="dialog"]'
      )!;
      await user.click(await within(dialog).findByText(second.name));
      expect(storeIssue('a').labels.map((l) => l.id)).toEqual([first.id, second.id]);
      await waitFor(() => expect(apiMocks.addLabel).toHaveBeenCalledWith('a', second.id));
      // Linha re-renderizada com o novo badge.
      expect(screen.getByLabelText('Change labels').textContent).toContain(second.name);

      await user.click(within(dialog).getByText(first.name));
      expect(storeIssue('a').labels.map((l) => l.id)).toEqual([second.id]);
      await waitFor(() => expect(apiMocks.removeLabel).toHaveBeenCalledWith('a', first.id));
   });

   it('projeto: o chip abre o seletor e "No Project" remove o projeto', async () => {
      const user = userEvent.setup();
      render(<Row id="a" />);
      await user.click(screen.getByLabelText('Change project: Alpha'));
      await user.click(await screen.findByText('No Project'));

      expect(storeIssue('a').project).toBeUndefined();
      expect(screen.queryByLabelText('Change project: Alpha')).toBeNull();
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('a', { projectId: null }));
   });

   it('falha da API: rollback do otimista na linha', async () => {
      apiMocks.update.mockRejectedValue(new Error('500'));
      const user = userEvent.setup();
      render(<Row id="a" />);
      await user.click(screen.getByLabelText('Change priority: No priority'));
      await user.click(await screen.findByText('High'));
      await waitFor(() =>
         expect(screen.getByLabelText('Change priority: No priority')).toBeTruthy()
      );
   });
});

describe('IssueLine — drag-and-drop no modo lista', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      apiMocks.update.mockImplementation(async () => ({}));
      apiMocks.reorder.mockImplementation(async (id: string) => {
         const issue = storeIssue(id);
         return { ...issue, status: { ...issue.status }, priority: { ...issue.priority } };
      });
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
   });

   function Harness() {
      const issues = useIssuesStore((s) => s.issues);
      return (
         <DndProvider backend={HTML5Backend}>
            {issues.map((issue) => (
               <Row key={issue.id} id={issue.id} orderedIssues={issues} />
            ))}
         </DndProvider>
      );
   }
   const rows = () => Array.from(document.querySelectorAll('[class*="group/line"]'));

   it('soltar sobre linha de outro status muda o status da arrastada', async () => {
      useIssuesStore.setState({
         issues: [
            makeIssue({ id: 'a', title: 'Alpha', status: todo }),
            makeIssue({ id: 'b', title: 'Beta', status: inProgress }),
         ],
      });
      render(<Harness />);
      const [rowA, rowB] = rows();
      act(() => lastTestBackend!.simulateDragDrop(rowA, rowB));

      expect(storeIssue('a').status.id).toBe('in-progress');
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('a', { statusId: 'in-progress' })
      );
   });

   it('soltar sobre linha do mesmo status reordena por rank (vizinhos do alvo)', async () => {
      // Ranks LexoRank válidos (o otimista calcula `rankBetween` dos vizinhos).
      const r1 = firstRank();
      const r2 = rankAfter(r1);
      const r3 = rankAfter(r2);
      useIssuesStore.setState({
         issues: [
            makeIssue({ id: 'a', title: 'Alpha', rank: r1 }),
            makeIssue({ id: 'b', title: 'Beta', rank: r2 }),
            makeIssue({ id: 'c', title: 'Gamma', rank: r3 }),
         ],
      });
      render(<Harness />);
      const [rowA, , rowC] = rows();
      // Sem layout no jsdom o drop cai "abaixo" do alvo: A vai para depois de C.
      act(() => lastTestBackend!.simulateDragDrop(rowA, rowC));

      await waitFor(() => expect(apiMocks.reorder).toHaveBeenCalledWith('a', 'c', null));
      expect(useIssuesStore.getState().issues.map((i) => i.id)).toEqual(['b', 'c', 'a']);
   });
});
