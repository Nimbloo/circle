import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscription = vi.fn();
vi.mock('@/lib/client', () => ({
   api: { issues: { subscription: (...a: unknown[]) => subscription(...a) } },
}));

import { useWorkspaceStore } from '@/store/workspace-store';

/** Issue fechada seguida entra na lista local depois da consulta (bootstrap só traz abertas). */
describe('ensureSubscriptionKnown', () => {
   beforeEach(() => {
      subscription.mockReset();
      useWorkspaceStore.setState({ me: { id: 'me', subscribedIssueIds: ['a'] } as never });
   });

   it('inclui a issue fechada seguida', async () => {
      subscription.mockResolvedValue({ id: 'x', subscribed: true });
      await useWorkspaceStore.getState().ensureSubscriptionKnown('x');
      expect(useWorkspaceStore.getState().me?.subscribedIssueIds).toEqual(['a', 'x']);
   });

   it('não consulta quando já está na lista; não inclui quando não segue', async () => {
      await useWorkspaceStore.getState().ensureSubscriptionKnown('a');
      expect(subscription).not.toHaveBeenCalled();
      subscription.mockResolvedValue({ id: 'y', subscribed: false });
      await useWorkspaceStore.getState().ensureSubscriptionKnown('y');
      expect(useWorkspaceStore.getState().me?.subscribedIssueIds).toEqual(['a']);
   });
});
