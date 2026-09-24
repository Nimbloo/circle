// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Initiative } from '@/data/initiatives';
import { health } from '@/data/projects';
import { priorities } from '@/data/priorities';
import InitiativeDetails from '@/components/common/initiatives/initiative-details';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Auditoria de toasts (item 10): o PATCH do parent dava certo e o GET seguinte (recarga da
 * mãe) falhava → "Não foi possível atualizar as sub-initiatives", com a mudança salva.
 */

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', initiativeId: 'mother' }),
   usePathname: () => '/nimbloo/initiative/mother',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('nuqs', () => ({
   useQueryState: () => ['overview', vi.fn()],
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
}));
const apiMocks = vi.hoisted(() => ({ update: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: {
      initiatives: { update: apiMocks.update, get: apiMocks.get, activity: vi.fn(async () => []) },
      projectSnapshots: { forInitiative: vi.fn(async () => []) },
   },
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function initiative(id: string, name: string, parentId: string | null, childIds: string[] = []) {
   return {
      id,
      name,
      icon: '🎯',
      status: 'active',
      priority: priorities[0],
      health: health[0],
      labels: [],
      projectIds: [],
      parentId,
      childIds,
      rollupProjectCount: 0,
      rollupCompletedProjectCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
   } as Initiative;
}

const dto = (id: string, parentId: string | null) => ({
   id,
   slug: id,
   name: id,
   description: null,
   icon: null,
   iconColor: null,
   status: 'active',
   priority: { id: priorities[0].id, name: priorities[0].name },
   health: { id: health[0].id, name: health[0].name },
   owner: null,
   target: null,
   startDate: null,
   targetDate: null,
   labels: [],
   projectIds: [],
   projectCount: 0,
   completedProjectCount: 0,
   parentId,
   childIds: [],
   rollupProjectCount: 0,
   rollupCompletedProjectCount: 0,
   createdAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({
      initiatives: [initiative('mother', 'Mother', null, ['child']), initiative('child', 'Child', 'mother')],
      projects: [],
      users: [],
      loaded: true,
   });
});

describe('sub-initiatives — mutação salva com recarga falhando', () => {
   it('remover: PATCH ok e GET da mãe falha → sucesso + aviso de recarga, sem erro', async () => {
      apiMocks.update.mockResolvedValue(dto('child', null));
      apiMocks.get.mockRejectedValue(new Error('Failed to fetch'));
      render(<InitiativeDetails initiativeId="mother" />);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Child' }));
      await waitFor(() =>
         expect(toastMock.success).toHaveBeenCalledWith('Sub-initiative removida')
      );
      await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
      expect(toastMock.error).not.toHaveBeenCalled();
   });

   it('PATCH recusado (400) mostra o motivo do servidor', async () => {
      apiMocks.update.mockRejectedValue(
         Object.assign(new Error('Ciclo de initiatives'), { status: 400 })
      );
      render(<InitiativeDetails initiativeId="mother" />);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Child' }));
      await waitFor(() =>
         expect(toastMock.error).toHaveBeenCalledWith(
            'Não foi possível atualizar as sub-initiatives: Ciclo de initiatives'
         )
      );
      expect(apiMocks.get).not.toHaveBeenCalled();
   });
});
