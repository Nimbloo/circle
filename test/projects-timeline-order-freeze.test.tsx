// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import type { ProjectGroup } from '@/components/common/projects/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { seedCatalog } from './helpers/catalog-fixture';
import { makeProject, toProjectDto } from './helpers/project-fixture';

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

/** Mesma ordenação por start-date que `Projects` aplica antes de repassar `groups`. */
function Harness() {
   const projects = useWorkspaceStore((s) => s.projects);
   const sorted = projects.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
   const groups: ProjectGroup[] = [{ id: 'all', name: 'All projects', projects: sorted }];
   return <ProjectsTimeline groups={groups} />;
}

const rowOrder = () =>
   screen
      .getAllByRole('button', { name: /^(Alpha|Beta|Gamma),/ })
      .map((el) => (el.getAttribute('aria-label') ?? '').split(',')[0]);

/** Largura de um dia no zoom inicial (Year: 76px por mês). */
const DAY_WIDTH = 76 / 30.4;

describe('ProjectsTimeline — ordem estável durante o arraste (pl#17)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      seedCatalog();
      useWorkspaceStore.setState({
         projects: [
            makeProject({
               id: 'p1',
               name: 'Alpha',
               startDate: '2026-09-01',
               targetDate: '2026-09-10',
            }),
            makeProject({
               id: 'p2',
               name: 'Beta',
               startDate: '2026-09-05',
               targetDate: '2026-09-15',
            }),
         ],
      });
      apiMocks.update.mockImplementation(
         async (id: string, body: { startDate: string; targetDate: string }) =>
            toProjectDto(makeProject({ id, name: id === 'p1' ? 'Alpha' : 'Beta', ...body }))
      );
   });

   it('mantém a ordem da linha durante o arraste e ~300ms após soltar, depois reordena', () => {
      vi.useFakeTimers();
      try {
         render(<Harness />);
         expect(rowOrder()).toEqual(['Alpha', 'Beta']);

         const alpha = screen.getByRole('button', { name: /^Alpha,/ });
         const wrapper = alpha.parentElement!;

         fireEvent.pointerDown(alpha, { button: 0, pointerId: 1, clientX: 0 });
         fireEvent.pointerMove(wrapper, { pointerId: 1, clientX: DAY_WIDTH * 10 });
         // Ainda arrastando (draft muda a data-chave de Alpha para depois de Beta).
         expect(rowOrder()).toEqual(['Alpha', 'Beta']);

         fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: DAY_WIDTH * 10 });
         // O store já foi atualizado otimisticamente (Alpha passou a data de Beta)...
         expect(
            useWorkspaceStore.getState().projects.find((p) => p.id === 'p1')!.startDate >
               '2026-09-05'
         ).toBe(true);
         // ...mas a ordem visual segue congelada logo após soltar.
         expect(rowOrder()).toEqual(['Alpha', 'Beta']);

         act(() => {
            vi.advanceTimersByTime(299);
         });
         expect(rowOrder()).toEqual(['Alpha', 'Beta']);

         act(() => {
            vi.advanceTimersByTime(10);
         });
         expect(rowOrder()).toEqual(['Beta', 'Alpha']);
      } finally {
         vi.useRealTimers();
      }
   });

   it('linha que some no meio do arraste não deixa a ordem congelada para sempre', () => {
      vi.useFakeTimers();
      try {
         useWorkspaceStore.setState({
            projects: [
               ...useWorkspaceStore.getState().projects,
               makeProject({
                  id: 'p3',
                  name: 'Gamma',
                  startDate: '2026-09-08',
                  targetDate: '2026-09-20',
               }),
            ],
         });
         render(<Harness />);
         const alpha = screen.getByRole('button', { name: /^Alpha,/ });
         fireEvent.pointerDown(alpha, { button: 0, pointerId: 1, clientX: 0 });
         fireEvent.pointerMove(alpha.parentElement!, { pointerId: 1, clientX: DAY_WIDTH * 10 });

         // Outra aba apagou Alpha durante o gesto: a barra desmonta sem pointerup.
         act(() => {
            useWorkspaceStore.setState({
               projects: useWorkspaceStore.getState().projects.filter((p) => p.id !== 'p1'),
            });
         });
         act(() => {
            vi.advanceTimersByTime(400);
         });

         // Gamma passa a começar antes de Beta: a ordem precisa reagir.
         act(() => {
            useWorkspaceStore.setState({
               projects: useWorkspaceStore
                  .getState()
                  .projects.map((p) => (p.id === 'p3' ? { ...p, startDate: '2026-09-01' } : p)),
            });
         });
         expect(rowOrder()).toEqual(['Gamma', 'Beta']);
      } finally {
         vi.useRealTimers();
      }
   });
});
