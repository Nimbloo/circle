// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetailDto } from '@/lib/api/project-detail';
import {
   ProjectDetailProvider,
   useProjectDetail,
   useSharedProjectDetail,
} from '@/components/common/projects/details/use-project-detail';
import ProjectOverview from '@/components/common/projects/details/project-overview';
import { PROJECT_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';

const detail = vi.hoisted(() => vi.fn());

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
         projects: { detail, updateDetail: vi.fn() },
         projectSnapshots: { forProject: vi.fn(async () => []) },
         projectDependencies: { list: vi.fn(async () => []) },
      },
   };
});
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function dto(summary: string): ProjectDetailDto {
   return {
      projectId: 'p1',
      summary,
      description: [],
      descriptionDoc: null,
      milestones: [],
      resources: [],
      updates: [],
      activity: [],
      descriptionVersion: `v-${summary}`,
   };
}

function deferred<T>() {
   let resolve!: (v: T) => void;
   let reject!: (e: unknown) => void;
   const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
   });
   return { promise, resolve, reject };
}

beforeEach(() => {
   detail.mockReset();
   useWorkspaceStore.setState({
      projects: [makeProject({ id: 'p1', name: 'Apollo' })],
      loaded: true,
   });
});

describe('useProjectDetail (#45, R4)', () => {
   it('um fetch no provider é compartilhado pelas abas', async () => {
      detail.mockResolvedValue(dto('shared'));
      const wrapper = ({ children }: { children: React.ReactNode }) => (
         <ProjectDetailProvider projectId="p1">{children}</ProjectDetailProvider>
      );
      const a = renderHook(() => useSharedProjectDetail('p1'), { wrapper });
      await waitFor(() => expect(a.result.current.status).toBe('ready'));
      expect(a.result.current.detail.summary).toBe('shared');
      expect(detail).toHaveBeenCalledTimes(1);
   });

   it('resposta fora de ordem é descartada (sequência)', async () => {
      const first = deferred<ProjectDetailDto>();
      const second = deferred<ProjectDetailDto>();
      detail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { result } = renderHook(() => useProjectDetail('p1'));

      act(() => {
         window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { id: 'p1' } }));
      });
      await act(async () => second.resolve(dto('novo')));
      await act(async () => first.resolve(dto('velho')));

      expect(result.current.detail.summary).toBe('novo');
   });

   it('evento do projeto recarrega; falha de refetch preserva a tela', async () => {
      detail.mockResolvedValueOnce(dto('um'));
      const { result } = renderHook(() => useProjectDetail('p1'));
      await waitFor(() => expect(result.current.detail.summary).toBe('um'));

      detail.mockRejectedValueOnce(new Error('rede'));
      await act(async () => {
         window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { id: 'p1' } }));
      });
      expect(result.current.status).toBe('ready');
      expect(result.current.detail.summary).toBe('um');

      detail.mockResolvedValueOnce(dto('dois'));
      await act(async () => {
         window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { id: 'p1' } }));
      });
      expect(result.current.detail.summary).toBe('dois');
   });
});

describe('overview do projeto (#34)', () => {
   it('1ª carga falha → ErrorState com retry e o editor não monta', async () => {
      detail.mockRejectedValueOnce(new Error('rede'));
      render(
         <ProjectDetailProvider projectId="p1">
            <ProjectOverview projectId="p1" />
         </ProjectDetailProvider>
      );

      expect(await screen.findByText('Could not load the project')).toBeTruthy();
      expect(document.querySelector('.ProseMirror')).toBeNull();

      detail.mockResolvedValueOnce(dto('ok'));
      await act(async () => screen.getByRole('button', { name: 'Try again' }).click());
      await waitFor(() => expect(screen.queryByText('Could not load the project')).toBeNull());
   });
});
