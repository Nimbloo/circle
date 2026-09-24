// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';

/** `ISSUE_CHANGED_EVENT` (literal: importar `use-live-sync` puxa os stores antes do mock). */
const ISSUE_CHANGED_EVENT = 'circle:issue-changed';
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
            R.createElement('button', { onClick: () => onSave(docOf('rascunho local')) }, 'salvar')
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

   it('refetch que saiu antes de um save confirmado não reverte o editor', async () => {
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValueOnce(detailDto('minha', 'v1'));
      render(<IssueDetailView issue={issue} />);
      await screen.findByText('minha');

      // Evento de outra pessoa (ex.: status) dispara um refetch que demora…
      let resolveStale!: (v: unknown) => void;
      apiMocks.issues.detail.mockReturnValueOnce(new Promise((r) => (resolveStale = r)));
      act(() => {
         window.dispatchEvent(new CustomEvent(ISSUE_CHANGED_EVENT, { detail: { id: 'i1' } }));
      });
      await waitFor(() => expect(apiMocks.issues.detail).toHaveBeenCalledTimes(2));

      // …enquanto o autosave grava e é confirmado (v2).
      apiMocks.issues.updateDetail.mockResolvedValueOnce(detailDto('salvo', 'v2'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(apiMocks.issues.updateDetail).toHaveBeenCalledTimes(1));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 10));
      });

      // O refetch antigo responde com o conteúdo de ANTES do save: não pode entrar.
      await act(async () => resolveStale(detailDto('antes do save', 'v1')));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 10));
      });
      expect(screen.getByTestId('doc').textContent).not.toBe('antes do save');

      apiMocks.issues.updateDetail.mockResolvedValueOnce(detailDto('salvo', 'v3'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() =>
         expect(apiMocks.issues.updateDetail).toHaveBeenLastCalledWith(
            'i1',
            expect.objectContaining({ expectedDescriptionVersion: 'v2' })
         )
      );
   });

   it('erro de rede no autosave: um toast só (id fixo), não um por save', async () => {
      const { toast } = await import('sonner');
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValueOnce(detailDto('minha', 'v1'));
      render(<IssueDetailView issue={issue} />);
      await screen.findByText('minha');
      apiMocks.issues.updateDetail.mockRejectedValue(new Error('offline'));
      await act(async () => screen.getByText('salvar').click());
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
      const ids = vi
         .mocked(toast.error)
         .mock.calls.map(([, opts]) => (opts as { id?: string })?.id);
      expect(ids[0]).toBeTruthy();
      expect(ids[1]).toBe(ids[0]);
      apiMocks.issues.updateDetail.mockReset();
   });

   it('409: "Restaurar minha versão" reaplica o texto local sobre a versão nova e salva', async () => {
      const { toast } = await import('sonner');
      const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
      apiMocks.issues.detail.mockResolvedValueOnce(detailDto('minha', 'v1'));
      render(<IssueDetailView issue={issue} />);
      await screen.findByText('minha');

      apiMocks.issues.updateDetail.mockRejectedValueOnce(new FakeApiError(409));
      apiMocks.issues.detail.mockResolvedValueOnce(detailDto('da outra pessoa', 'v2'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('da outra pessoa'));

      const opts = vi.mocked(toast.warning).mock.calls.at(-1)?.[1] as
         | { action?: { label: string; onClick: () => void } }
         | undefined;
      expect(opts?.action?.label).toBe('Restaurar minha versão');

      apiMocks.issues.updateDetail.mockResolvedValueOnce(detailDto('rascunho local', 'v3'));
      await act(async () => opts!.action!.onClick());
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('rascunho local'));
      await waitFor(() =>
         expect(apiMocks.issues.updateDetail).toHaveBeenLastCalledWith('i1', {
            descriptionDoc: docOf('rascunho local'),
            expectedDescriptionVersion: 'v2',
         })
      );
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });
      expect(apiMocks.issues.updateDetail).toHaveBeenCalledTimes(2);
   });
});
