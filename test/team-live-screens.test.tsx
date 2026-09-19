// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'o', teamId: 'CORE' }) }));
vi.mock('next/link', () => ({
   default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const apiMocks = vi.hoisted(() => ({ documents: vi.fn(), joinRequests: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { teams: { documents: apiMocks.documents, joinRequests: apiMocks.joinRequests } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DOCUMENT_CHANGED_EVENT, TEAM_CHANGED_EVENT } = await import('@/lib/use-live-sync');
const { default: TeamOverview } = await import('@/components/common/teams/team-overview');
const { default: TeamMembers } = await import('@/components/common/teams/team-members');

const fire = (name: string, detail: object) =>
   act(() => {
      window.dispatchEvent(new CustomEvent(name, { detail }));
   });

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.documents.mockResolvedValue([]);
   apiMocks.joinRequests.mockResolvedValue([]);
   useWorkspaceStore.setState({
      teams: [{ id: 'CORE', name: 'Core', icon: '', members: [] }] as never,
      loaded: true,
      me: { id: 'me', admin: true } as never,
   });
});

describe('telas do time ao vivo (#58)', () => {
   it('overview recarrega os documentos fixados em DOCUMENT_CHANGED do time', async () => {
      render(<TeamOverview />);
      await waitFor(() => expect(apiMocks.documents).toHaveBeenCalledTimes(1));
      fire(DOCUMENT_CHANGED_EVENT, { id: 'd1', teamId: 'OUTRO' });
      fire(DOCUMENT_CHANGED_EVENT, { id: 'd1', teamId: 'CORE' });
      await waitFor(() => expect(apiMocks.documents).toHaveBeenCalledTimes(2));
   });

   it('membros do time recarrega a fila de solicitações em TEAM_CHANGED do time', async () => {
      render(<TeamMembers />);
      await waitFor(() => expect(apiMocks.joinRequests).toHaveBeenCalledTimes(1));
      fire(TEAM_CHANGED_EVENT, { id: 'CORE', teamId: 'CORE' });
      await waitFor(() => expect(apiMocks.joinRequests).toHaveBeenCalledTimes(2));
   });
});
