// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import type { ProjectGroup } from '@/components/common/projects/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';

vi.mock('@/lib/client', () => {
   class ApiError extends Error {}
   return {
      ApiError,
      api: {
         projects: {
            update: vi.fn(),
            detail: vi.fn(() => new Promise(() => {})),
         },
         projectDependencies: { list: vi.fn(async () => []) },
         projectSnapshots: { list: vi.fn(async () => []) },
      },
   };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/projects',
   useRouter: () => ({ push: vi.fn() }),
}));

function Harness() {
   const projects = useWorkspaceStore((s) => s.projects);
   const groups: ProjectGroup[] = [{ id: 'all', name: 'All projects', projects }];
   return <ProjectsTimeline groups={groups} />;
}

const bar = () => screen.getByRole('button', { name: /^Alpha,/ });
const peekOpen = () => screen.queryByRole('button', { name: 'Close panel' }) !== null;

beforeEach(() => {
   seedCatalog();
   useWorkspaceStore.setState({
      loaded: true,
      users: [],
      teams: [],
      initiatives: [],
      projects: [
         makeProject({
            id: 'p1',
            name: 'Alpha',
            startDate: '2026-09-01',
            targetDate: '2026-09-30',
         }),
      ],
   });
});

describe('timeline: clique na barra abre o peek (pl#1)', () => {
   it('com a captura do ponteiro no wrapper (o click cai nele), o pointerup sem mover abre', () => {
      render(<Harness />);
      const wrapper = bar().parentElement!;
      fireEvent.pointerDown(bar(), { button: 0, pointerId: 1, clientX: 10 });
      fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 10 });
      // Navegador real: com setPointerCapture o click é despachado no wrapper, não no botão.
      fireEvent.click(wrapper);
      expect(peekOpen()).toBe(true);
   });

   it('quando o click também chega no botão, o peek não abre e fecha na mesma hora', () => {
      render(<Harness />);
      const wrapper = bar().parentElement!;
      fireEvent.pointerDown(bar(), { button: 0, pointerId: 1, clientX: 10 });
      fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 10 });
      fireEvent.click(bar());
      expect(peekOpen()).toBe(true);
   });

   it('Enter no botão focado (click sem ponteiro) continua abrindo', () => {
      render(<Harness />);
      fireEvent.click(bar());
      expect(peekOpen()).toBe(true);
   });
});

describe('atalhos de zoom não agem com dialog aberto (pl#19)', () => {
   it('M com um dialog aberto não troca o zoom; sem dialog troca', () => {
      render(<Harness />);
      expect(screen.getByText('Year')).toBeTruthy();
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('data-state', 'open');
      document.body.appendChild(dialog);
      act(() => {
         fireEvent.keyDown(window, { key: 'm' });
      });
      expect(screen.queryByText('Month')).toBeNull();
      dialog.remove();
      act(() => {
         fireEvent.keyDown(window, { key: 'm' });
      });
      expect(screen.getByText('Month')).toBeTruthy();
   });
});
