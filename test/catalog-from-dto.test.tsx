// @vitest-environment jsdom

import './setup-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueDto } from '@/lib/api/issues';

const api = vi.hoisted(() => ({ workspace: vi.fn() }));
vi.mock('@/lib/client', () => ({ api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useCatalogStore } = await import('@/store/catalog-store');
const { useIssuesStore } = await import('@/store/issues-store');
const { useWorkspaceStore } = await import('@/store/workspace-store');
const { adaptIssue } = await import('@/lib/adapters');
const { WorkspaceLoadGate } = await import('@/components/layout/workspace-load-gate');

const bootstrap = (statuses: Record<string, unknown>[]) => ({
   me: { id: 'me' },
   statuses,
   projectStatuses: [],
   priorities: [{ id: 'high', name: 'High', sortRank: 1 }],
   labels: [{ id: 'bug', name: 'Bug', color: 'red', groupId: null }],
   healthStates: [],
   members: [],
   projects: [],
   teams: [],
   cycles: [],
   initiatives: [],
   views: [],
});

const qa = { id: 'qa', name: 'QA', color: '#123456', category: 'started', position: 0 };

function dto(status: Record<string, unknown>): IssueDto {
   return {
      id: 'i1',
      identifier: 'ENG-1',
      teamId: 'ENG',
      title: 'T',
      status,
      priority: { id: 'high', name: 'High' },
      assignee: null,
      assignees: [],
      createdBy: null,
      project: null,
      cycleId: '',
      labels: [],
      rank: 'a',
      dueDate: null,
      estimate: null,
      subIssueCount: 0,
      subIssueDoneCount: 0,
      parentId: null,
      parentIdentifier: null,
      snoozedUntil: null,
      slaAppliedAt: null,
      slaDueAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
   } as unknown as IssueDto;
}

beforeEach(() => {
   vi.clearAllMocks();
});

describe('catálogo sem mocks (#16)', () => {
   it('nasce vazio e sem loaded (nada de labels/status de demonstração)', () => {
      const s = useCatalogStore.getState();
      expect(s.loaded).toBe(false);
      expect(s.statuses).toEqual([]);
      expect(s.projectStatuses).toEqual([]);
      expect(s.labels).toEqual([]);
      expect(s.priorities).toEqual([]);
   });

   it('status novo ganha ícone da categoria com a cor do DTO', () => {
      useCatalogStore.getState().setCatalogs(bootstrap([qa]) as never);
      const Icon = useCatalogStore.getState().statuses[0].icon;
      const { container } = render(<Icon />);
      expect(container.querySelector('svg')).not.toBeNull();
      expect(container.innerHTML).toContain('#123456');
   });

   it('issue com status fora do catálogo usa nome/cor/categoria do DTO', () => {
      const issue = adaptIssue(dto({ ...qa, id: 'novo', name: 'Novo', color: '#abcdef' }));
      expect(issue.status.name).toBe('Novo');
      const Icon = issue.status.icon;
      const { container } = render(<Icon />);
      expect(container.innerHTML).toContain('#abcdef');
   });

   it('status renomeado no catálogo reflete nas issues em memória', () => {
      useCatalogStore.getState().setCatalogs(bootstrap([qa]) as never);
      useIssuesStore.setState({ issues: [adaptIssue(dto(qa))] });
      useCatalogStore.getState().applyStatus({ ...qa, name: 'Quality' } as never);
      expect(useIssuesStore.getState().issues[0].status.name).toBe('Quality');
   });
});

describe('falha do bootstrap (#16)', () => {
   it('marca loadError; retry com sucesso limpa o erro', async () => {
      useWorkspaceStore.setState({ loaded: false, loadError: false });
      api.workspace.mockRejectedValueOnce(new Error('503'));
      await useWorkspaceStore.getState().hydrate();
      expect(useWorkspaceStore.getState().loadError).toBe(true);
      api.workspace.mockResolvedValueOnce(bootstrap([qa]));
      await useWorkspaceStore.getState().hydrate();
      expect(useWorkspaceStore.getState().loadError).toBe(false);
      expect(useWorkspaceStore.getState().loaded).toBe(true);
   });

   it('o shell mostra o erro com retry no lugar do skeleton eterno', async () => {
      const hydrate = vi.fn(async () => {});
      useWorkspaceStore.setState({ loaded: false, loadError: true, hydrate });
      render(
         <WorkspaceLoadGate>
            <p>conteúdo</p>
         </WorkspaceLoadGate>
      );
      expect(screen.queryByText('conteúdo')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
      expect(hydrate).toHaveBeenCalledTimes(1);
   });

   it('sem erro, o shell só repassa o conteúdo', () => {
      useWorkspaceStore.setState({ loaded: false, loadError: false });
      render(
         <WorkspaceLoadGate>
            <p>conteúdo</p>
         </WorkspaceLoadGate>
      );
      expect(screen.getByText('conteúdo')).toBeTruthy();
   });
});
