// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import type { ProjectGroup } from '@/components/common/projects/projects';
import {
   daysFromPixels,
   keyboardRescheduleDelta,
   rescheduleRange,
   shiftIsoDate,
} from '@/lib/timeline-reschedule';
import { useWorkspaceStore } from '@/store/workspace-store';
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

/** Mesmo recorte que `Projects` faz sem agrupamento: uma linha por projeto. */
function Harness() {
   const projects = useWorkspaceStore((s) => s.projects);
   const groups: ProjectGroup[] = [{ id: 'all', name: 'All projects', projects }];
   return <ProjectsTimeline groups={groups} />;
}

const bar = (name: string) => screen.getByRole('button', { name });

/** Largura de um dia no zoom inicial (Year: 76px por mês). */
const DAY_WIDTH = 76 / 30.4;

describe('timeline-reschedule (regras puras)', () => {
   it('desloca datas ISO em UTC, cruzando mês e ano', () => {
      expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01');
      expect(shiftIsoDate('2027-01-01', -1)).toBe('2026-12-31');
      expect(shiftIsoDate('2026-03-01', -7)).toBe('2026-02-22');
   });

   it('snap por dia arredonda o deslocamento em pixels', () => {
      expect(daysFromPixels(0, DAY_WIDTH)).toBe(0);
      expect(daysFromPixels(DAY_WIDTH * 2.4, DAY_WIDTH)).toBe(2);
      expect(daysFromPixels(-DAY_WIDTH * 2.6, DAY_WIDTH)).toBe(-3);
      expect(daysFromPixels(50, 0)).toBe(0);
   });

   it('move desloca as duas datas; start/end mexem só numa ponta sem cruzar a outra', () => {
      const range = { startDate: '2026-09-01', targetDate: '2026-09-10' };
      expect(rescheduleRange(range, 'move', 3)).toEqual({
         startDate: '2026-09-04',
         targetDate: '2026-09-13',
      });
      expect(rescheduleRange(range, 'start', 2)).toEqual({
         startDate: '2026-09-03',
         targetDate: '2026-09-10',
      });
      expect(rescheduleRange(range, 'end', -2)).toEqual({
         startDate: '2026-09-01',
         targetDate: '2026-09-08',
      });
      expect(rescheduleRange(range, 'start', 30).startDate).toBe('2026-09-10');
      expect(rescheduleRange(range, 'end', -30).targetDate).toBe('2026-09-01');
      expect(rescheduleRange(range, 'move', 0)).toBe(range);
   });

   it('←/→ movem 1 dia, Shift+←/→ 7; outras teclas não são tratadas', () => {
      expect(keyboardRescheduleDelta({ key: 'ArrowLeft', shiftKey: false })).toBe(-1);
      expect(keyboardRescheduleDelta({ key: 'ArrowRight', shiftKey: false })).toBe(1);
      expect(keyboardRescheduleDelta({ key: 'ArrowLeft', shiftKey: true })).toBe(-7);
      expect(keyboardRescheduleDelta({ key: 'ArrowRight', shiftKey: true })).toBe(7);
      expect(keyboardRescheduleDelta({ key: 'Enter', shiftKey: false })).toBeNull();
   });
});

describe('ProjectsTimeline — reschedule', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useWorkspaceStore.setState({ projects: [makeProject({ id: 'p1', name: 'Alpha' })] });
      apiMocks.update.mockImplementation(
         async (_id: string, body: { startDate: string; targetDate: string }) =>
            toProjectDto(makeProject({ id: 'p1', name: 'Alpha', ...body }))
      );
   });

   it('teclado: → move 1 dia e Shift+← move 7, com PATCH das duas datas', async () => {
      render(<Harness />);
      const alpha = bar('Alpha, Sep 1 - Sep 30');
      expect(alpha.getAttribute('aria-keyshortcuts')).toContain('ArrowRight');

      fireEvent.keyDown(alpha, { key: 'ArrowRight' });
      expect(apiMocks.update).toHaveBeenLastCalledWith('p1', {
         startDate: '2026-09-02',
         targetDate: '2026-10-01',
      });
      // Otimista: o rótulo do intervalo já reflete o novo período.
      expect(bar('Alpha, Sep 2 - Oct 1')).toBeTruthy();

      await waitFor(() =>
         expect(useWorkspaceStore.getState().projects[0].startDate).toBe('2026-09-02')
      );
      fireEvent.keyDown(bar('Alpha, Sep 2 - Oct 1'), { key: 'ArrowLeft', shiftKey: true });
      expect(apiMocks.update).toHaveBeenLastCalledWith('p1', {
         startDate: '2026-08-26',
         targetDate: '2026-09-24',
      });
      expect(bar('Alpha, Aug 26 - Sep 24')).toBeTruthy();
      expect(toast.success).not.toHaveBeenCalled();
   });

   it('quando o PATCH falha, o intervalo volta ao original e avisa', async () => {
      apiMocks.update.mockRejectedValue(new Error('boom'));
      render(<Harness />);

      fireEvent.keyDown(bar('Alpha, Sep 1 - Sep 30'), { key: 'ArrowRight' });
      expect(bar('Alpha, Sep 2 - Oct 1')).toBeTruthy();

      await waitFor(() => expect(bar('Alpha, Sep 1 - Sep 30')).toBeTruthy());
      expect(useWorkspaceStore.getState().projects[0].targetDate).toBe('2026-09-30');
      expect(toast.error).toHaveBeenCalledTimes(1);
   });

   it('arrastar a alça direita muda só a target date, com tooltip durante o arraste', async () => {
      render(<Harness />);
      const handle = screen.getByTestId('resize-end-p1');
      const wrapper = handle.parentElement!;

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 });
      fireEvent.pointerMove(wrapper, { pointerId: 1, clientX: 100 + DAY_WIDTH * 3 });
      expect(screen.getByRole('tooltip').textContent).toBe('Sep 1 - Oct 3');
      expect(apiMocks.update).not.toHaveBeenCalled();

      fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 100 + DAY_WIDTH * 3 });
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(apiMocks.update).toHaveBeenCalledWith('p1', {
         startDate: '2026-09-01',
         targetDate: '2026-10-03',
      });
      await waitFor(() =>
         expect(useWorkspaceStore.getState().projects[0].targetDate).toBe('2026-10-03')
      );
   });

   it('arrastar o corpo da barra desloca as duas datas e não abre o peek', () => {
      render(<Harness />);
      const alpha = bar('Alpha, Sep 1 - Sep 30');
      const wrapper = alpha.parentElement!;

      fireEvent.pointerDown(alpha, { button: 0, pointerId: 1, clientX: 0 });
      fireEvent.pointerMove(wrapper, { pointerId: 1, clientX: -DAY_WIDTH * 2 });
      fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: -DAY_WIDTH * 2 });
      fireEvent.click(alpha);

      expect(apiMocks.update).toHaveBeenCalledWith('p1', {
         startDate: '2026-08-30',
         targetDate: '2026-09-28',
      });
      // O click que encerra o arraste não seleciona a barra (estilo tracejado do peek).
      expect(bar('Alpha, Aug 30 - Sep 28').className).not.toContain('border-dashed');
   });

   it('sem target date a barra não é arrastável nem responde ao teclado', () => {
      act(() =>
         useWorkspaceStore.setState({
            projects: [makeProject({ id: 'p2', name: 'Beta', targetDate: undefined })],
         })
      );
      render(<Harness />);
      const beta = bar('Beta, Sep 1');
      expect(beta.getAttribute('aria-keyshortcuts')).toBeNull();
      expect(screen.queryByTestId('resize-end-p2')).toBeNull();

      fireEvent.keyDown(beta, { key: 'ArrowRight' });
      expect(apiMocks.update).not.toHaveBeenCalled();
   });
});
