// @vitest-environment jsdom

import './setup-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyIssuesTab } from '@/components/common/my-issues/use-my-issues';

/**
 * Aba Activity reaberta: a nova busca começava com o mesmo `attempt` da anterior, então o
 * resultado (ou o erro) velho aparecia no lugar do carregando.
 */

const apiMocks = vi.hoisted(() => ({ me: { activity: vi.fn() } }));
vi.mock('@/lib/client', () => ({ api: apiMocks }));
vi.mock('nuqs', () => ({
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
   useQueryState: () => ['activity', () => {}],
}));

const { useMyIssuesActiveIds } = await import('@/components/common/my-issues/use-my-issues');

beforeEach(() => {
   vi.clearAllMocks();
});

describe('useMyIssuesActiveIds — reabrir a aba Activity', () => {
   it('volta a carregar (não reusa o erro anterior) enquanto a nova busca não responde', async () => {
      apiMocks.me.activity.mockRejectedValueOnce(new Error('Failed to fetch'));
      const { result, rerender } = renderHook(({ tab }) => useMyIssuesActiveIds(tab), {
         initialProps: { tab: 'activity' as MyIssuesTab },
      });
      await waitFor(() => expect(result.current.error).toBe(true));

      rerender({ tab: 'assigned' });
      let resolve!: (v: unknown[]) => void;
      apiMocks.me.activity.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      rerender({ tab: 'activity' });

      expect(result.current.error).toBe(false);
      expect(result.current.loading).toBe(true);
      await act(async () => resolve([{ issueId: 'i-1' }]));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect([...result.current.activeIds]).toEqual(['i-1']);
   });
});
