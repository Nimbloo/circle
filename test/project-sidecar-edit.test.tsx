// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPropertiesPanel } from '@/components/common/projects/details/project-properties-panel';
import { ProjectPeekPanel } from '@/components/common/projects/project-peek-panel';
import { emptyProjectDetail } from '@/lib/adapters-project-detail';
import type { User } from '@/data/users';
import type { Initiative } from '@/data/initiatives';
import { priorities } from '@/data/priorities';
import { health } from '@/data/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject, toProjectDto } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';

const apiMocks = vi.hoisted(() => ({ update: vi.fn(), detail: vi.fn() }));

vi.mock('@/lib/client', () => {
   class ApiError extends Error {
      constructor(
         public readonly status: number,
         message: string
      ) {
         super(message);
      }
   }
   return {
      ApiError,
      api: {
         projects: { update: apiMocks.update, detail: apiMocks.detail },
         projectSnapshots: { list: vi.fn(async () => []) },
         projectDependencies: { list: vi.fn(async () => []), set: vi.fn() },
      },
   };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/project/p1/overview',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('nuqs', async (importOriginal) => ({
   ...(await importOriginal<typeof import('nuqs')>()),
   useQueryState: () => [null, vi.fn()],
   useQueryStates: () => [{}, vi.fn()],
}));

const ANA: User = {
   id: 'u-ana',
   name: 'Ana',
   email: 'ana@nimbloo.ai',
   avatarUrl: '',
   status: 'offline',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: ['CORE'],
   timezone: 'UTC',
};

const GOAL: Initiative = {
   id: 'i1',
   name: 'Growth',
   icon: 'target',
   status: 'active',
   priority: priorities[0],
   health: health[0],
   labels: [],
   projectIds: [],
   parentId: null,
   childIds: [],
   rollupProjectCount: 0,
   rollupCompletedProjectCount: 0,
   createdAt: '2026-01-01',
};

const team = (id: string, name: string) =>
   ({
      id,
      name,
      icon: '🧩',
      joined: true,
      color: 'var(--primary)',
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      autoCloseParent: false,
      autoCloseChildren: false,
      parentId: null,
      members: [],
   }) as unknown as ReturnType<typeof useWorkspaceStore.getState>['teams'][number];

/** Painel lendo o projeto do store, como a página: a edição reflete na hora. */
function Sidecar() {
   const project = useWorkspaceStore((s) => s.getProjectById('p1'));
   if (!project) return null;
   return (
      <ProjectPropertiesPanel
         project={project}
         detail={emptyProjectDetail('p1')}
         issues={[]}
         projectId="p1"
      />
   );
}

const current = () => useWorkspaceStore.getState().getProjectById('p1')!;
const button = (name: RegExp) => screen.getByRole('button', { name });
const option = (name: RegExp) => screen.getByRole('option', { name });

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
   // Devolve o estado otimista atual como DTO do servidor.
   apiMocks.update.mockImplementation(async () => ({
      ...toProjectDto(current()),
      initiativeId: current().initiative ?? null,
      labels: current().labels,
   }));
   useWorkspaceStore.setState({
      loaded: true,
      users: [ANA],
      teams: [team('CORE', 'Core'), team('WEB', 'Web')],
      initiatives: [GOAL],
      projects: [makeProject({ id: 'p1', name: 'Alpha' })],
   });
});

describe('sidecar do projeto editável (pl#2)', () => {
   it('status: escolher no seletor grava via PATCH e reflete no store na hora', async () => {
      render(<Sidecar />);
      fireEvent.click(button(/change status/i));
      fireEvent.click(option(/In Progress/));
      expect(current().status.id).toBe('in-progress');
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('p1', { statusId: 'in-progress' })
      );
   });

   it('prioridade, lead e health são editáveis', async () => {
      render(<Sidecar />);
      fireEvent.click(button(/change priority/i));
      fireEvent.click(option(new RegExp(priorities[2].name)));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('p1', { priorityId: priorities[2].id })
      );

      fireEvent.click(button(/change lead/i));
      fireEvent.click(option(/Ana/));
      expect(current().lead?.id).toBe('u-ana');
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('p1', { leadId: 'u-ana' }));

      fireEvent.click(button(/change health/i));
      fireEvent.click(option(/At Risk/));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('p1', { healthId: 'at-risk' })
      );
   });

   it('times, initiative e labels são editáveis; a initiative mostra o glyph, não o texto', async () => {
      render(<Sidecar />);
      fireEvent.click(button(/change team/i));
      fireEvent.click(option(/Web/));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('p1', { teamId: 'WEB' }));

      fireEvent.click(button(/change initiative/i));
      fireEvent.click(option(/Growth/));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('p1', { initiativeId: 'i1' })
      );
      const initiativeButton = button(/change initiative/i);
      expect(within(initiativeButton).getByText('Growth')).toBeTruthy();
      expect(initiativeButton.textContent).not.toContain('target');

      fireEvent.click(button(/change labels/i));
      fireEvent.click(option(/Bug/));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('p1', { labelIds: ['bug'] })
      );
      expect(current().labels.map((l) => l.id)).toEqual(['bug']);
   });

   it('data alvo pode ser removida pelo seletor', async () => {
      render(<Sidecar />);
      fireEvent.click(button(/change target date/i));
      fireEvent.click(screen.getByRole('button', { name: /clear/i }));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('p1', { targetDate: null }));
      expect(current().targetDate).toBeUndefined();
   });

   it('falha do PATCH desfaz o valor otimista', async () => {
      apiMocks.update.mockRejectedValueOnce(new Error('boom'));
      render(<Sidecar />);
      fireEvent.click(button(/change status/i));
      fireEvent.click(option(/In Progress/));
      await waitFor(() => expect(current().status.id).toBe('backlog'));
   });

   it('vazio aparece como "Add X"', () => {
      render(<Sidecar />);
      expect(button(/change lead/i).textContent).toMatch(/Add lead/);
      expect(button(/change labels/i).textContent).toMatch(/Add label/);
      expect(button(/change initiative/i).textContent).toMatch(/Add initiative/);
   });
});

describe('peek do projeto editável (pl#2)', () => {
   it('usa as mesmas linhas editáveis do sidecar', async () => {
      render(<ProjectPeekPanel projectId="p1" onClose={() => {}} />);
      fireEvent.click(button(/change status/i));
      fireEvent.click(option(/In Progress/));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('p1', { statusId: 'in-progress' })
      );
   });

   it('entra com fade + slide, não aparece seco (pl#16)', () => {
      render(<ProjectPeekPanel projectId="p1" onClose={() => {}} />);
      const panel = screen.getByTestId('project-peek-panel');
      expect(panel.className).toContain('animate-in');
      expect(panel.className).toContain('fade-in');
      expect(panel.className).toContain('slide-in-from-right');
   });
});
