// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import type { ProjectGroup } from '@/components/common/projects/projects';
import * as scale from '@/lib/timeline-scale';
import { makeProject } from './helpers/project-fixture';

vi.mock('@/lib/client', () => ({ api: { projects: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

// Espiões: `offsetForTime` desenha a escala (ticks/datas); o CapacityRing é por linha.
vi.mock('@/lib/timeline-scale', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/lib/timeline-scale')>();
   return { ...actual, offsetForTime: vi.fn(actual.offsetForTime) };
});
const ringRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/common/cycles/capacity-ring', () => ({
   CapacityRing: () => {
      ringRenders.count++;
      return null;
   },
}));

/**
 * #26: o scroll horizontal atualizava o `viewport` no estado da timeline inteira — a
 * cada frame re-renderizavam a escala (centenas de ticks), as grades e todas as linhas.
 * Só o indicador "fora da tela" depende do viewport.
 */
describe('timeline de projetos — scroll', () => {
   beforeAll(() => {
      // Frame síncrono: o handler de scroll agenda o sync do viewport via rAF.
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
         cb(0);
         return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
   });

   it('rolar não re-renderiza a escala nem as linhas; o indicador acompanha', () => {
      const projects = Array.from({ length: 5 }, (_, i) =>
         makeProject({
            id: `p${i}`,
            name: `Projeto ${i}`,
            startDate: '2026-09-01',
            targetDate: '2026-09-30',
         })
      );
      const groups: ProjectGroup[] = [{ id: 'all', name: 'All projects', projects }];
      const { container } = render(<ProjectsTimeline groups={groups} />);
      const scroller = container.querySelector<HTMLElement>('.overflow-auto')!;

      vi.mocked(scale.offsetForTime).mockClear();
      ringRenders.count = 0;

      // Viewport longe das barras (fim da régua): os indicadores "←" aparecem.
      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 800 });
      act(() => {
         scroller.scrollLeft = 100_000;
         fireEvent.scroll(scroller);
      });

      expect(vi.mocked(scale.offsetForTime)).not.toHaveBeenCalled();
      expect(ringRenders.count).toBe(0);
      expect(screen.getAllByText(/Sep 1/).length).toBeGreaterThan(0);
   });
});
