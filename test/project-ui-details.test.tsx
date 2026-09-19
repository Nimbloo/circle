// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectLine from '@/components/common/projects/project-line';
import ProjectHeader from '@/components/layout/headers/project/header';
import { ProjectPropertiesPanel } from '@/components/common/projects/details/project-properties-panel';
import { formatPlanDay } from '@/components/common/projects/format-day';
import { emptyProjectDetail } from '@/lib/adapters-project-detail';
import type { Issue } from '@/data/issues';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject, statusOf, toProjectDto } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';
import { SidebarProvider } from '@/components/ui/sidebar';

const push = vi.hoisted(() => vi.fn());
const apiMocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), detail: vi.fn() }));

vi.mock('@/lib/client', () => {
   class ApiError extends Error {}
   return {
      ApiError,
      api: {
         projects: { update: apiMocks.update, remove: apiMocks.remove, detail: apiMocks.detail },
         projectDependencies: { list: vi.fn(async () => []) },
         projectSnapshots: { list: vi.fn(async () => []) },
      },
   };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/project/p1/overview',
   useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock('nuqs', async (importOriginal) => ({
   ...(await importOriginal<typeof import('nuqs')>()),
   useQueryState: () => [[], vi.fn()],
   useQueryStates: () => [{}, vi.fn()],
}));

const PROJECT = makeProject({ id: 'p1', name: 'Alpha', targetDate: '2026-09-30' });

const issue = (id: string): Issue =>
   ({
      id,
      identifier: `ENG-${id}`,
      title: id,
      status: statusOf('in-progress'),
      assignee: null,
      priority: { id: 'no-priority', name: 'No priority', icon: () => null },
      labels: [],
      createdAt: '2026-09-01',
      cycleId: '',
      rank: 'a',
      subscriberIds: [],
   }) as unknown as Issue;

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   apiMocks.detail.mockResolvedValue({
      projectId: 'p1',
      summary: '',
      description: [],
      descriptionDoc: null,
      milestones: [],
      resources: [],
      updates: [],
      activity: [],
   });
   useWorkspaceStore.setState({
      loaded: true,
      users: [],
      teams: [],
      initiatives: [],
      projects: [PROJECT],
   });
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
});

describe('data alvo na lista de projetos (pl#9)', () => {
   it('usa o formato curto, sem o ano corrente', () => {
      expect(formatPlanDay('2026-09-30', new Date('2026-05-01T12:00:00'))).toBe('Sep 30');
      expect(formatPlanDay('2027-03-20', new Date('2026-05-01T12:00:00'))).toBe('Mar 20, 2027');
      render(<ProjectLine project={PROJECT} />);
      expect(screen.getByLabelText('Set target date').textContent).toContain('Sep 30');
   });
});

describe('breakdown do sidecar fora da aba Issues (pl#7)', () => {
   it('clicar numa linha abre a aba Issues já filtrada', () => {
      render(
         <ProjectPropertiesPanel
            project={PROJECT}
            detail={emptyProjectDetail('p1')}
            issues={[issue('a')]}
            projectId="p1"
         />
      );
      fireEvent.click(screen.getByRole('button', { name: /No assignee/ }));
      expect(push).toHaveBeenCalledTimes(1);
      const url = String(push.mock.calls[0][0]);
      expect(url.startsWith('/nimbloo/project/p1/issues?filters=')).toBe(true);
      expect(JSON.parse(decodeURIComponent(url.split('filters=')[1]))).toEqual([
         { columnId: 'assignee', type: 'option', operator: 'is', values: ['unassigned'] },
      ]);
   });
});

describe('header do projeto (pl#14)', () => {
   it('tem menu de ações e as abas na ordem Overview, Issues, Activity', async () => {
      render(
         <SidebarProvider>
            <ProjectHeader projectId="p1" />
         </SidebarProvider>
      );
      expect(
         screen.getAllByRole('link').map((link) => link.textContent)
      ).toEqual(['Overview', 'Issues', 'Activity']);
      expect(screen.getByRole('button', { name: 'Project actions' })).toBeTruthy();
   });

   it('o menu exclui o projeto depois da confirmação', async () => {
      apiMocks.remove.mockResolvedValue({ deleted: true });
      render(
         <SidebarProvider>
            <ProjectHeader projectId="p1" />
         </SidebarProvider>
      );
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Project actions' }), {
         button: 0,
         ctrlKey: false,
      });
      fireEvent.click(await screen.findByText('Delete project'));
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith('p1'));
      expect(push).toHaveBeenCalledWith('/nimbloo/projects');
   });
});
