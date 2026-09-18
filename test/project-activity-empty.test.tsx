// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detail = vi.fn();
vi.mock('@/lib/client', () => ({
   api: { projects: { detail: (...args: unknown[]) => detail(...args) } },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
// O painel lateral não participa do feed; isolado para o teste não depender dele.
vi.mock('@/components/common/projects/details/project-side-panel', () => ({
   ProjectSidePanel: () => null,
}));

import ProjectActivity from '@/components/common/projects/details/project-activity';
import type { Project } from '@/data/projects';
import { useWorkspaceStore } from '@/store/workspace-store';

// Só a existência do projeto importa para o feed (o painel lateral está mockado).
const project = { id: 'p1', name: 'Platform' } as unknown as Project;
const emptyDto = {
   projectId: project.id,
   summary: '',
   description: [],
   resources: [],
   milestones: [],
   updates: [],
   activity: [],
};

/**
 * O feed de updates não pode dizer "vazio" enquanto o detalhe carrega nem quando a
 * carga falha — só depois de uma resposta real sem updates.
 */
describe('feed de updates do projeto', () => {
   beforeEach(() => {
      useWorkspaceStore.setState({ projects: [project], loaded: true });
      detail.mockReset();
   });

   it('primeira carga mostra skeleton, não o vazio', async () => {
      let resolve!: (value: unknown) => void;
      detail.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<ProjectActivity projectId={project.id} />);

      expect(screen.queryByText(/No updates yet/)).toBeNull();

      await act(async () => resolve(emptyDto));
      expect(screen.getByText('No updates yet')).toBeTruthy();
   });

   it('falha mostra erro, não o vazio', async () => {
      detail.mockRejectedValue(new Error('boom'));
      render(<ProjectActivity projectId={project.id} />);
      expect(await screen.findByText('Could not load updates.')).toBeTruthy();
      expect(screen.queryByText(/No updates yet/)).toBeNull();
   });
});
