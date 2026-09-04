// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import ProjectsBoard from '@/components/common/projects/projects-board';
import type { ProjectGroup } from '@/components/common/projects/projects';
import type { Project } from '@/data/projects';
import type { Team } from '@/data/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import { lastTestBackend } from './helpers/dnd-test-backend';
import { makeProject, statusOf, toProjectDto } from './helpers/project-fixture';

const apiMocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@/lib/client', () => ({
   api: { projects: { update: apiMocks.update } },
}));

vi.mock('sonner', () => ({
   toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

// Backend de teste no lugar do HTML5 (jsdom não tem drag nativo).
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const COLUMNS = [statusOf('backlog'), statusOf('in-progress')];

/** Mesmo recorte que `Projects` faz para o board: uma coluna por status. */
function Harness() {
   const projects = useWorkspaceStore((s) => s.projects);
   const groups: ProjectGroup[] = COLUMNS.map((status) => ({
      id: status.id,
      name: status.name,
      status,
      projects: projects.filter((p) => p.status.id === status.id),
   }));
   return <ProjectsBoard groups={groups} />;
}

const column = (name: string) => screen.getByRole('list', { name });
const cardIn = (columnName: string) => within(column(columnName)).getByRole('listitem');

function dragCardTo(columnName: string) {
   const card = cardIn('Backlog');
   act(() => lastTestBackend!.simulateDragDrop(card, column(columnName)));
}

describe('ProjectsBoard — drag and drop entre colunas', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useWorkspaceStore.setState({ projects: [makeProject({ id: 'p1', name: 'Alpha' })] });
   });

   it('soltar o card em outra coluna faz PATCH do statusId e move o card na hora', async () => {
      apiMocks.update.mockImplementation(async (_id: string, body: { statusId: string }) =>
         toProjectDto(makeProject({ id: 'p1', name: 'Alpha', status: statusOf(body.statusId) }))
      );
      render(<Harness />);
      expect(within(column('Backlog')).getByText('Alpha')).toBeTruthy();

      dragCardTo('In Progress');

      // Otimista: o card já está na coluna nova antes da resposta.
      expect(within(column('In Progress')).getByText('Alpha')).toBeTruthy();
      expect(within(column('Backlog')).queryByText('Alpha')).toBeNull();
      expect(apiMocks.update).toHaveBeenCalledWith('p1', { statusId: 'in-progress' });

      await waitFor(() =>
         expect(useWorkspaceStore.getState().projects[0].status.id).toBe('in-progress')
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
   });

   it('quando o PATCH falha, volta o card para a coluna original e avisa', async () => {
      apiMocks.update.mockRejectedValue(new Error('boom'));
      render(<Harness />);

      dragCardTo('In Progress');
      expect(within(column('In Progress')).getByText('Alpha')).toBeTruthy();

      await waitFor(() => expect(within(column('Backlog')).getByText('Alpha')).toBeTruthy());
      expect(within(column('In Progress')).queryByText('Alpha')).toBeNull();
      expect(useWorkspaceStore.getState().projects[0].status.id).toBe('backlog');
      expect(toast.error).toHaveBeenCalledTimes(1);
   });

   it('soltar na própria coluna não chama a API', () => {
      render(<Harness />);
      dragCardTo('Backlog');
      expect(apiMocks.update).not.toHaveBeenCalled();
      expect(within(column('Backlog')).getByText('Alpha')).toBeTruthy();
   });

   it('o card expõe aria-grabbed e a instrução de arraste', () => {
      render(<Harness />);
      const card = cardIn('Backlog');
      expect(card.getAttribute('aria-grabbed')).toBe('false');
      const hint = document.getElementById(card.getAttribute('aria-describedby')!);
      expect(hint?.textContent).toContain('change its status');
   });
});

/** Times mínimos do store; `projects` é a cópia derivada que precisa seguir o projeto. */
function makeTeam(id: string, name: string, projects: Project[] = []): Team {
   return {
      id,
      name,
      icon: '🛠️',
      joined: true,
      color: '#000',
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      autoCloseParent: false,
      autoCloseChildren: false,
      parentId: null,
      members: [],
      projects,
   };
}

/** Mesmo recorte que `Projects` faz para o board agrupado por time: uma coluna por time. */
function TeamHarness() {
   const projects = useWorkspaceStore((s) => s.projects);
   const teams = useWorkspaceStore((s) => s.teams);
   const groups: ProjectGroup[] = teams.map((team) => ({
      id: team.id,
      name: team.name,
      icon: team.icon,
      teamId: team.id,
      projects: projects.filter((p) => p.teamId === team.id),
   }));
   return <ProjectsBoard groups={groups} />;
}

describe('ProjectsBoard — agrupado por time', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      const alpha = makeProject({ id: 'p1', name: 'Alpha', teamId: 'CORE' });
      useWorkspaceStore.setState({
         projects: [alpha],
         teams: [makeTeam('CORE', 'Core', [alpha]), makeTeam('DESIGN', 'Design')],
      });
   });

   it('soltar o card na coluna de outro time faz PATCH do teamId e mantém teams[].projects coerente', async () => {
      apiMocks.update.mockImplementation(async (_id: string, body: { teamId: string }) =>
         toProjectDto(makeProject({ id: 'p1', name: 'Alpha', teamId: body.teamId }))
      );
      render(<TeamHarness />);
      expect(within(column('Core')).getByText('Alpha')).toBeTruthy();

      const card = cardIn('Core');
      act(() => lastTestBackend!.simulateDragDrop(card, column('Design')));

      // Otimista: o card já está na coluna do time novo antes da resposta.
      expect(within(column('Design')).getByText('Alpha')).toBeTruthy();
      expect(within(column('Core')).queryByText('Alpha')).toBeNull();
      expect(apiMocks.update).toHaveBeenCalledWith('p1', { teamId: 'DESIGN' });

      await waitFor(() => expect(useWorkspaceStore.getState().projects[0].teamId).toBe('DESIGN'));
      const teams = useWorkspaceStore.getState().teams;
      expect(teams.find((t) => t.id === 'CORE')?.projects).toHaveLength(0);
      expect(teams.find((t) => t.id === 'DESIGN')?.projects.map((p) => p.id)).toEqual(['p1']);
      expect(toast.error).not.toHaveBeenCalled();
   });

   it('quando o PATCH falha, volta o card para o time original e avisa', async () => {
      apiMocks.update.mockRejectedValue(new Error('boom'));
      render(<TeamHarness />);

      act(() => lastTestBackend!.simulateDragDrop(cardIn('Core'), column('Design')));
      expect(within(column('Design')).getByText('Alpha')).toBeTruthy();

      await waitFor(() => expect(within(column('Core')).getByText('Alpha')).toBeTruthy());
      expect(within(column('Design')).queryByText('Alpha')).toBeNull();
      expect(useWorkspaceStore.getState().projects[0].teamId).toBe('CORE');
      expect(
         useWorkspaceStore.getState().teams.find((t) => t.id === 'CORE')?.projects
      ).toHaveLength(1);
      expect(toast.error).toHaveBeenCalledTimes(1);
   });

   it('soltar no próprio time não chama a API e a instrução fala em time', () => {
      render(<TeamHarness />);
      const card = cardIn('Core');
      act(() => lastTestBackend!.simulateDragDrop(card, column('Core')));
      expect(apiMocks.update).not.toHaveBeenCalled();
      const hint = document.getElementById(card.getAttribute('aria-describedby')!);
      expect(hint?.textContent).toContain('change its team');
   });
});
