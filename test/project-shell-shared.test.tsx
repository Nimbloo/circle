// @vitest-environment jsdom

import './setup-dom';
import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailProvider } from '@/components/common/projects/details/use-project-detail';
import { ProjectDependenciesPicker } from '@/components/common/projects/details/project-dependencies-picker';
import { ProgressHistory } from '@/components/common/projects/progress-history';
import { PROJECT_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';

const apiMocks = vi.hoisted(() => ({
   detail: vi.fn(),
   deps: vi.fn(),
   snapshots: vi.fn(),
}));

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
         projects: { detail: apiMocks.detail },
         projectDependencies: { list: apiMocks.deps, set: vi.fn() },
         projectSnapshots: { list: apiMocks.snapshots },
      },
   };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.detail.mockResolvedValue({
      projectId: 'a',
      summary: '',
      description: [],
      descriptionDoc: null,
      milestones: [],
      resources: [],
      updates: [],
      activity: [],
   });
   apiMocks.deps.mockResolvedValue(['b']);
   apiMocks.snapshots.mockResolvedValue([]);
   useWorkspaceStore.setState({
      loaded: true,
      projects: [
         makeProject({ id: 'a', name: 'Design system' }),
         makeProject({ id: 'b', name: 'Icon set' }),
         makeProject({ id: 'c', name: 'Tokens' }),
      ],
   });
});

/** Simula a troca de aba: o conteúdo remonta, o provider (layout) fica. */
function Tabs() {
   const [tab, setTab] = useState(0);
   return (
      <>
         <button onClick={() => setTab((t) => t + 1)}>next tab</button>
         <div key={tab}>
            <ProjectDependenciesPicker projectId="a" />
            <ProgressHistory projectId="a" />
         </div>
      </>
   );
}

describe('dependências e snapshots guardados no provider do projeto (pl#6)', () => {
   it('remontar o painel não refaz os GETs de dependências e snapshots', async () => {
      render(
         <ProjectDetailProvider projectId="a">
            <Tabs />
         </ProjectDetailProvider>
      );
      expect(await screen.findByText('Icon set')).toBeTruthy();
      fireEvent.click(screen.getByText('next tab'));
      // Já carregado: aparece de imediato, sem o vazio ("Add dependency") no meio.
      expect(screen.getByText('Icon set')).toBeTruthy();
      expect(screen.getByLabelText('Depends on').textContent).toContain('1 project');
      expect(apiMocks.deps).toHaveBeenCalledTimes(1);
      expect(apiMocks.snapshots).toHaveBeenCalledTimes(1);
   });

   it('enquanto carrega não afirma que não há dependências', () => {
      apiMocks.deps.mockReturnValue(new Promise(() => {}));
      render(
         <ProjectDetailProvider projectId="a">
            <ProjectDependenciesPicker projectId="a" />
         </ProjectDetailProvider>
      );
      expect(screen.getByLabelText('Depends on').textContent).not.toMatch(/Add dependency|0/);
   });
});

describe('"Depends on" ao vivo (pl#8)', () => {
   it('evento remoto do projeto recarrega as dependências', async () => {
      render(
         <ProjectDetailProvider projectId="a">
            <ProjectDependenciesPicker projectId="a" />
         </ProjectDetailProvider>
      );
      expect(await screen.findByText('Icon set')).toBeTruthy();
      apiMocks.deps.mockResolvedValue(['c']);
      act(() => {
         window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { id: 'a' } }));
      });
      expect(await screen.findByText('Tokens')).toBeTruthy();
      await waitFor(() => expect(screen.queryByText('Icon set')).toBeNull());
   });
});

describe('sidecar montado no layout do projeto (pl#6)', () => {
   const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

   it('o layout monta o painel e as abas não montam o próprio', () => {
      expect(read('app/[orgId]/project/[projectId]/layout.tsx')).toMatch(/ProjectShell/);
      for (const tab of ['project-overview', 'project-issues', 'project-activity']) {
         expect(read(`components/common/projects/details/${tab}.tsx`)).not.toMatch(
            /<ProjectSidePanel/
         );
      }
   });
});
