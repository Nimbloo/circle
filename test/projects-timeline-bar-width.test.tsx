// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import type { ProjectGroup } from '@/components/common/projects/projects';
import { makeProject } from './helpers/project-fixture';

vi.mock('@/lib/client', () => ({ api: { projects: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

/**
 * pl#17: a barra respeitava um mínimo de 130px mesmo para projetos de poucos dias,
 * distorcendo a duração real na régua. Abaixo do limiar "estreito" o nome sai da
 * barra (à direita) em vez de forçar a largura.
 */
describe('timeline de projetos — largura da barra (pl#17)', () => {
   it('projeto de 2 dias não força 130px; o nome aparece fora da barra', () => {
      const project = makeProject({
         id: 'p-short',
         name: 'Spike curto',
         startDate: '2026-09-01',
         targetDate: '2026-09-02',
      });
      const groups: ProjectGroup[] = [{ id: 'all', name: 'All projects', projects: [project] }];
      render(<ProjectsTimeline groups={groups} />);

      const bar = screen.getByRole('button', { name: /^Spike curto,/ });
      const wrapper = bar.parentElement as HTMLElement;
      expect(wrapper.style.width).not.toBe('130px');
      expect(Number.parseFloat(wrapper.style.width)).toBeLessThan(120);
      // O nome não fica truncado DENTRO do botão estreito — sai como rótulo ao lado
      // (a lista fixa à esquerda também mostra o nome; por isso duas ocorrências).
      expect(bar.textContent).not.toContain('Spike curto');
      expect(screen.getAllByText('Spike curto').length).toBeGreaterThanOrEqual(1);
   });

   it('projeto de duração longa mostra o nome dentro da barra normalmente', () => {
      const project = makeProject({
         id: 'p-long',
         name: 'Projeto longo',
         startDate: '2026-09-01',
         targetDate: '2026-11-30',
      });
      const groups: ProjectGroup[] = [{ id: 'all', name: 'All projects', projects: [project] }];
      render(<ProjectsTimeline groups={groups} />);

      const bar = screen.getByRole('button', { name: /^Projeto longo,/ });
      expect(bar.textContent).toContain('Projeto longo');
   });
});
