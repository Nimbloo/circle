// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoadmapDto } from '@/lib/client';
import Roadmap from '@/components/common/roadmap/roadmap';
import RoadmapTimeline, {
   type RoadmapRenderGroup,
} from '@/components/common/roadmap/roadmap-timeline';
import { ProjectSnapshotChart } from '@/components/common/projects/project-snapshot-chart';
import { useRoadmapDisplayStore } from '@/store/roadmap-display-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject, toProjectDto } from './helpers/project-fixture';

const apiMocks = vi.hoisted(() => ({ roadmap: vi.fn() }));

vi.mock('@/lib/client', () => ({
   api: { roadmap: { get: apiMocks.roadmap } },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

const MOTHER = makeProject({ id: 'p-mother', name: 'Design system' });
const CHILD = makeProject({
   id: 'p-child',
   name: 'Icon set',
   startDate: '2026-10-01',
   targetDate: '2026-11-15',
});
const LOOSE = makeProject({ id: 'p-loose', name: 'Spike' });

function roadmapDto(overrides: Partial<RoadmapDto> = {}): RoadmapDto {
   return {
      groups: [
         {
            id: 'mother',
            name: 'Mother initiative',
            icon: '🎯',
            depth: 0,
            parentId: null,
            projectIds: ['p-mother'],
            projectCount: 2,
            completedProjectCount: 1,
            percentComplete: 50,
         },
         {
            id: 'child',
            name: 'Child initiative',
            icon: null,
            depth: 1,
            parentId: 'mother',
            projectIds: ['p-child'],
            projectCount: 1,
            completedProjectCount: 0,
            percentComplete: 0,
         },
         {
            id: 'no-initiative',
            name: 'No initiative',
            icon: null,
            depth: 0,
            parentId: null,
            projectIds: ['p-loose'],
            projectCount: 1,
            completedProjectCount: 0,
            percentComplete: 0,
         },
      ],
      projects: [MOTHER, CHILD, LOOSE].map(toProjectDto),
      milestones: [
         {
            id: 'm1',
            projectId: 'p-mother',
            name: 'Beta',
            targetDate: '2026-09-15',
            completed: false,
         },
      ],
      dependencies: [
         { projectId: 'p-child', dependsOnId: 'p-mother', late: true, reason: 'overlap' },
      ],
      ...overrides,
   };
}

/** Grupos já resolvidos, como o container entrega para a timeline. */
const RENDER_GROUPS: RoadmapRenderGroup[] = [
   {
      id: 'mother',
      name: 'Mother initiative',
      icon: '🎯',
      depth: 0,
      percentComplete: 50,
      projectCount: 2,
      completedProjectCount: 1,
      projects: [MOTHER],
   },
   {
      id: 'child',
      name: 'Child initiative',
      icon: null,
      depth: 1,
      percentComplete: 0,
      projectCount: 1,
      completedProjectCount: 0,
      projects: [CHILD],
   },
];

beforeEach(() => {
   apiMocks.roadmap.mockReset();
   useWorkspaceStore.setState({ projects: [MOTHER, CHILD, LOOSE], loaded: true });
   useRoadmapDisplayStore.setState({
      zoom: 'quarter',
      showCompleted: true,
      showDependencies: true,
      showMilestones: true,
      showProjectList: true,
      ordering: 'start-date',
   });
});

describe('Roadmap — agrupamento por initiative (#102)', () => {
   it('renderiza um cabeçalho por initiative com o progresso agregado e uma barra por projeto', async () => {
      apiMocks.roadmap.mockResolvedValue(roadmapDto());

      render(<Roadmap />);

      expect(await screen.findByText('Mother initiative')).toBeTruthy();
      expect(screen.getByText('Child initiative')).toBeTruthy();
      expect(screen.getByText('No initiative')).toBeTruthy();
      // Rollup da subárvore no cabeçalho da mãe.
      expect(screen.getByText('1/2')).toBeTruthy();
      expect(screen.getByText('50%')).toBeTruthy();
      expect(screen.getByTestId('roadmap-bar-p-mother')).toBeTruthy();
      expect(screen.getByTestId('roadmap-bar-p-child')).toBeTruthy();
   });

   it('a opção Show completed vira o parâmetro da consulta', async () => {
      apiMocks.roadmap.mockResolvedValue(roadmapDto());
      useRoadmapDisplayStore.setState({ showCompleted: false, ordering: 'title' });

      render(<Roadmap />);

      await waitFor(() =>
         expect(apiMocks.roadmap).toHaveBeenCalledWith({
            includeCompleted: false,
            sort: 'title',
         })
      );
   });
});

describe('Roadmap — marcos, setas e alerta de dependência (#102)', () => {
   const renderTimeline = (props: Partial<React.ComponentProps<typeof RoadmapTimeline>> = {}) =>
      render(
         <RoadmapTimeline
            groups={RENDER_GROUPS}
            milestones={[
               {
                  id: 'm1',
                  projectId: 'p-mother',
                  name: 'Beta',
                  targetDate: '2026-09-15',
                  completed: false,
               },
            ]}
            dependencies={[
               { projectId: 'p-child', dependsOnId: 'p-mother', late: true, reason: 'overlap' },
            ]}
            zoom="quarter"
            showDependencies
            showMilestones
            showProjectList
            {...props}
         />
      );

   it('desenha o losango do marco sobre a barra do projeto', () => {
      renderTimeline();
      expect(screen.getByTestId('roadmap-milestone-m1')).toBeTruthy();
   });

   it('"Show milestones" desligado esconde os losangos', () => {
      renderTimeline({ showMilestones: false });
      expect(screen.queryByTestId('roadmap-milestone-m1')).toBeNull();
   });

   it('desenha a seta da dependência e a badge de bloqueio no projeto dependente', () => {
      renderTimeline();
      expect(screen.getByTestId('roadmap-dependency-arrows')).toBeTruthy();
      expect(screen.getByTestId('roadmap-blocked-p-child').textContent).toContain(
         'Blocked: Design system late'
      );
   });

   it('"Show dependencies" desligado esconde as setas (a badge continua)', () => {
      renderTimeline({ showDependencies: false });
      expect(screen.queryByTestId('roadmap-dependency-arrows')).toBeNull();
      expect(screen.getByTestId('roadmap-blocked-p-child')).toBeTruthy();
   });

   it('sem grupos mostra o vazio honesto', () => {
      renderTimeline({ groups: [], milestones: [], dependencies: [] });
      expect(screen.getByText(/No projects to plot/i)).toBeTruthy();
   });
});

describe('Gráfico de progresso no tempo (#102)', () => {
   it('desenha uma linha por série com 2+ pontos', () => {
      render(
         <ProjectSnapshotChart
            points={[
               { date: '2026-03-01', scope: 10, started: 2, completed: 1 },
               { date: '2026-03-02', scope: 10, started: 3, completed: 4 },
               { date: '2026-03-03', scope: 12, started: 1, completed: 8 },
            ]}
         />
      );

      expect(screen.getByTestId('snapshot-chart')).toBeTruthy();
      // Uma faixa de hover por dia, com o resumo no aria-label.
      expect(screen.getByTestId('snapshot-point-2026-03-03').getAttribute('aria-label')).toBe(
         'Mar 3: scope 12, started 1, completed 8'
      );
      // Datas das pontas.
      expect(screen.getAllByText('Mar 1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mar 3').length).toBeGreaterThan(0);
   });

   it('com menos de 2 pontos não inventa tendência', () => {
      render(
         <ProjectSnapshotChart
            points={[{ date: '2026-03-01', scope: 3, started: 0, completed: 1 }]}
         />
      );
      expect(screen.getByTestId('snapshot-chart-empty')).toBeTruthy();
      expect(screen.queryByTestId('snapshot-chart')).toBeNull();
   });
});
