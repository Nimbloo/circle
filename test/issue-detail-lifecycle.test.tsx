// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { status } from './helpers/catalog-fixture';
import { priorities } from '@/data/priorities';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';

const apiMocks = vi.hoisted(() => ({
   issues: {
      detail: vi.fn(),
      activity: vi.fn(async () => []),
      updateDetail: vi.fn(),
      update: vi.fn(),
   },
}));
/** Cada render do painel de propriedades: (issue, detail que ele recebeu). */
const panelRenders = vi.hoisted(() => [] as { issueId: string; detailOf: string }[]);
/** Última `onOwnAction` recebida pelo feed (simula a ação do próprio usuário). */
const feedProps = vi.hoisted(() => ({ onOwnAction: undefined as undefined | (() => void) }));

vi.mock('@/lib/client', () => ({
   api: apiMocks,
   ApiError: class ApiError extends Error {},
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/lib/adapters-issue-detail', async (orig) => ({
   ...(await orig<typeof import('@/lib/adapters-issue-detail')>()),
   adaptIssueDetail: (dto: { identifier: string }) => ({
      identifier: dto.identifier,
      description: [],
      activity: [],
      subIssues: [],
   }),
}));
vi.mock('@/components/common/editor/block-editor', () => ({ BlockEditor: () => null }));
vi.mock('@/components/common/issues/details/activity-feed', () => ({
   ActivityFeed: (props: { onOwnAction?: () => void }) => {
      feedProps.onOwnAction = props.onOwnAction;
      return null;
   },
}));
vi.mock('@/components/common/issues/details/issue-properties-panel', () => ({
   IssuePropertiesPanel: ({ issue, detail }: { issue: Issue; detail: { identifier: string } }) => {
      panelRenders.push({ issueId: issue.id, detailOf: detail.identifier });
      return null;
   },
}));
vi.mock('@/components/common/detail-side-panel', () => ({
   DetailSidePanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
   DetailSidePanelTrigger: () => null,
}));

const dto = (identifier: string) => ({
   identifier,
   description: '',
   descriptionDoc: null,
   descriptionVersion: 'v1',
   parent: null,
   subIssues: [],
   subIssueIds: [],
   relatedIds: [],
   blockedByIds: [],
   blockingIds: [],
   duplicateIds: [],
   prLinks: [],
   attachments: [],
});

const make = (id: string, identifier: string): Issue => ({
   id,
   identifier,
   teamId: 'CORE',
   title: `Título ${identifier}`,
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: 'a1',
});

beforeEach(() => {
   vi.clearAllMocks();
   panelRenders.length = 0;
   feedProps.onOwnAction = undefined;
});

describe('detalhe da issue', () => {
   it('#26: trocar de issue nunca renderiza o detail da anterior com a nova', async () => {
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValueOnce(dto('CORE-1'));
      const { rerender } = render(<IssueDetailView issue={make('a', 'CORE-1')} />);
      await waitFor(() => expect(panelRenders.length).toBeGreaterThan(0));

      apiMocks.issues.detail.mockReturnValueOnce(new Promise(() => {}));
      rerender(<IssueDetailView issue={make('b', 'CORE-2')} />);
      expect(panelRenders.filter((r) => r.issueId === 'b' && r.detailOf === 'CORE-1')).toEqual([]);
   });

   it('Is#22: falha na 1ª carga mostra o erro com retry', async () => {
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockRejectedValueOnce(new Error('boom'));
      render(<IssueDetailView issue={make('a', 'CORE-1')} />);
      const retry = await screen.findByRole('button', { name: 'Try again' });
      apiMocks.issues.detail.mockResolvedValueOnce(dto('CORE-1'));
      await userEvent.setup().click(retry);
      await waitFor(() => expect(panelRenders.length).toBeGreaterThan(0));
   });

   it('#27: eco da própria ação no feed não recarrega o detail inteiro', async () => {
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValue(dto('CORE-1'));
      render(<IssueDetailView issue={make('a', 'CORE-1')} />);
      await waitFor(() => expect(feedProps.onOwnAction).toBeTypeOf('function'));
      expect(apiMocks.issues.detail).toHaveBeenCalledTimes(1);

      act(() => feedProps.onOwnAction!());
      act(() => {
         window.dispatchEvent(new CustomEvent(ISSUE_CHANGED_EVENT, { detail: { id: 'a' } }));
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(apiMocks.issues.detail).toHaveBeenCalledTimes(1);
   });

   it('evento de outra pessoa (sem ação própria) recarrega', async () => {
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValue(dto('CORE-1'));
      render(<IssueDetailView issue={make('a', 'CORE-1')} />);
      await waitFor(() => expect(apiMocks.issues.detail).toHaveBeenCalledTimes(1));
      act(() => {
         window.dispatchEvent(new CustomEvent(ISSUE_CHANGED_EVENT, { detail: { id: 'a' } }));
      });
      await waitFor(() => expect(apiMocks.issues.detail).toHaveBeenCalledTimes(2));
   });
});
