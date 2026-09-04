// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ProjectDependenciesPicker } from '@/components/common/projects/details/project-dependencies-picker';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), set: vi.fn() }));

vi.mock('@/lib/client', async () => {
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
      api: { projectDependencies: { list: apiMocks.list, set: apiMocks.set } },
   };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const A = makeProject({ id: 'a', name: 'Design system' });
const B = makeProject({ id: 'b', name: 'Icon set' });

beforeEach(() => {
   apiMocks.list.mockReset();
   apiMocks.set.mockReset();
   vi.mocked(toast.success).mockReset();
   vi.mocked(toast.error).mockReset();
   useWorkspaceStore.setState({ projects: [A, B], loaded: true });
});

describe('Picker "Depends on" (#102)', () => {
   it('mostra as dependências já gravadas como chips', async () => {
      apiMocks.list.mockResolvedValue(['b']);

      render(<ProjectDependenciesPicker projectId="a" />);

      expect(await screen.findByText('Icon set')).toBeTruthy();
      expect(screen.getByLabelText('Depends on').textContent).toContain('1 project');
   });

   it('remover um chip só festeja depois que a API confirma', async () => {
      apiMocks.list.mockResolvedValue(['b']);
      let resolveSet: (value: string[]) => void = () => {};
      apiMocks.set.mockReturnValue(
         new Promise<string[]>((resolve) => {
            resolveSet = resolve;
         })
      );

      render(<ProjectDependenciesPicker projectId="a" />);
      fireEvent.click(await screen.findByLabelText('Remove dependency Icon set'));

      // Otimista: o chip some na hora, mas nada de toast antes da confirmação.
      await waitFor(() => expect(screen.queryByText('Icon set')).toBeNull());
      expect(toast.success).not.toHaveBeenCalled();
      expect(apiMocks.set).toHaveBeenCalledWith('a', []);

      resolveSet([]);
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dependencies updated'));
   });

   it('um ciclo recusado pelo servidor faz rollback e mostra a razão', async () => {
      const { ApiError } = await import('@/lib/client');
      apiMocks.list.mockResolvedValue(['b']);
      apiMocks.set.mockRejectedValue(
         new ApiError(400, "Ciclo de dependências: 'b' já depende de 'a'")
      );

      render(<ProjectDependenciesPicker projectId="a" />);
      fireEvent.click(await screen.findByLabelText('Remove dependency Icon set'));

      await waitFor(() =>
         expect(toast.error).toHaveBeenCalledWith("Ciclo de dependências: 'b' já depende de 'a'")
      );
      // Rollback: o chip volta.
      expect(screen.getByText('Icon set')).toBeTruthy();
   });
});
