// @vitest-environment jsdom

import './setup-dom';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { ISSUE_MUTATION_TOAST, useIssuesStore } from '@/store/issues-store';
import { useSetParent } from '@/components/common/issues/details/parent-issue';

/**
 * Auditoria de toasts (15a): `useSetParent` decidia quem toasta olhando o store DEPOIS da
 * falha. Se a issue entra no store durante o request (live-sync), a falha do caminho
 * direto ficava muda; se sai, o erro aparecia duas vezes. E o motivo do 400 (ciclo de
 * parent) ficava escondido.
 */

const apiMocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/lib/client', () => ({ api: { issues: { update: apiMocks.update } } }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

const make = (id: string): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: id,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
});

const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

function deferred() {
   let reject!: (e: unknown) => void;
   const promise = new Promise<never>((_, r) => (reject = r));
   return { promise, reject };
}

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   useIssuesStore.setState({ issues: [], remoteDeletedIds: new Set() });
});

describe('useSetParent — toast de erro', () => {
   it('caminho direto: issue que entra no store durante o request ainda avisa a falha', async () => {
      const call = deferred();
      apiMocks.update.mockReturnValue(call.promise);
      const { result } = renderHook(() => useSetParent());
      let ok: boolean | undefined;
      await act(async () => {
         const p = result.current('c1', 'p1');
         useIssuesStore.setState({ issues: [make('c1')] }); // hydrate/live-sync no meio
         call.reject(apiError(400, 'Ciclo de parent'));
         ok = await p;
      });
      expect(ok).toBe(false);
      expect(toastMock.error).toHaveBeenCalledTimes(1);
      expect(toastMock.error).toHaveBeenCalledWith(
         'Could not update the parent issue: Ciclo de parent'
      );
   });

   it('caminho do store: issue que sai durante o request não duplica o erro', async () => {
      useIssuesStore.setState({ issues: [make('c1')] });
      const call = deferred();
      apiMocks.update.mockReturnValue(call.promise);
      const { result } = renderHook(() => useSetParent());
      await act(async () => {
         const p = result.current('c1', 'p1');
         useIssuesStore.setState({ issues: [] });
         call.reject(apiError(400, 'Ciclo de parent'));
         await p;
      });
      expect(toastMock.error).toHaveBeenCalledTimes(1);
      expect(toastMock.error).toHaveBeenCalledWith('Falha ao atualizar a issue: Ciclo de parent', {
         id: ISSUE_MUTATION_TOAST,
      });
   });
});
