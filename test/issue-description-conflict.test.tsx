// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { status } from './helpers/catalog-fixture';
import { priorities } from '@/data/priorities';

/**
 * Descrição com concorrência otimista (#36), lado do cliente: o save manda a versão que
 * o editor viu; um 409 NÃO vira "falha ao salvar" — o editor recarrega a versão do
 * servidor (remonta) e avisa. Saves seguintes vão com a versão nova.
 */
class FakeApiError extends Error {
   constructor(public readonly status: number) {
      super('api');
   }
}

const apiMocks = vi.hoisted(() => ({
   issues: {
      detail: vi.fn(),
      activity: vi.fn(async () => []),
      updateDetail: vi.fn(),
      update: vi.fn(),
   },
}));

vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: FakeApiError }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/lib/adapters-issue-detail', async (orig) => ({
   ...(await orig<typeof import('@/lib/adapters-issue-detail')>()),
   adaptIssueDetail: () => ({ identifier: 'CORE-1', description: [], activity: [], subIssues: [] }),
}));

const mounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/common/editor/block-editor', async () => {
   const R = await import('react');
   return {
      BlockEditor: ({
         doc,
         onSave,
      }: {
         doc: { content?: { content?: { text: string }[] }[] } | null;
         onSave: (d: unknown) => void;
      }) => {
         R.useEffect(() => {
            mounts.count++;
         }, []);
         const text = doc?.content?.[0]?.content?.[0]?.text ?? '';
         return R.createElement(
            'div',
            null,
            R.createElement('span', { 'data-testid': 'doc' }, text),
            R.createElement(
               'button',
               { onClick: () => onSave({ type: 'doc', content: [] }) },
               'salvar'
            )
         );
      },
   };
});
vi.mock('@/components/common/issues/details/activity-feed', () => ({ ActivityFeed: () => null }));
vi.mock('@/components/common/issues/details/issue-properties-panel', () => ({
   IssuePropertiesPanel: () => null,
}));
vi.mock('@/components/common/detail-side-panel', () => ({
   DetailSidePanel: () => null,
   DetailSidePanelTrigger: () => null,
}));

const docOf = (text: string) => ({
   type: 'doc',
   content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const detailDto = (text: string, version: string) => ({
   identifier: 'CORE-1',
   description: text,
   descriptionDoc: docOf(text),
   descriptionVersion: version,
   milestone: null,
   milestoneId: null,
   milestoneName: null,
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

const issue: Issue = {
   id: 'i1',
   identifier: 'CORE-1',
   teamId: 'CORE',
   title: 'X',
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: 'a1',
};

beforeEach(() => {
   vi.clearAllMocks();
   mounts.count = 0;
});

describe('descrição: conflito de edição (#36)', () => {
   it('manda a versão vista; 409 recarrega a versão do servidor, remonta o editor e avisa', async () => {
      const { toast } = await import('sonner');
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValueOnce(detailDto('minha', 'v1'));
      render(<IssueDetailView issue={issue} />);
      await screen.findByText('minha');
      const montagensIniciais = mounts.count;

      apiMocks.issues.updateDetail.mockRejectedValueOnce(new FakeApiError(409));
      apiMocks.issues.detail.mockResolvedValueOnce(detailDto('da outra pessoa', 'v2'));
      await act(async () => screen.getByText('salvar').click());

      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('da outra pessoa'));
      expect(apiMocks.issues.updateDetail).toHaveBeenCalledWith(
         'i1',
         expect.objectContaining({ expectedDescriptionVersion: 'v1' })
      );
      expect(mounts.count).toBeGreaterThan(montagensIniciais);
      expect(toast.warning).toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();

      // Próximo save já vai com a versão recarregada.
      apiMocks.issues.updateDetail.mockResolvedValueOnce(detailDto('nova', 'v3'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() =>
         expect(apiMocks.issues.updateDetail).toHaveBeenLastCalledWith(
            'i1',
            expect.objectContaining({ expectedDescriptionVersion: 'v2' })
         )
      );
   });
});
