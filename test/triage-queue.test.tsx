// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriageSuggestionDto } from '@/lib/api/triage';
import { useCatalogStore } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { labels } from './helpers/catalog-fixture';

/**
 * #28: a fila de triagem recarregava a cada evento de QUALQUER issue do workspace e o
 * card re-hidratava no meio da edição (o usuário perdia o que marcou).
 */

const apiMocks = vi.hoisted(() => ({
   suggestion: vi.fn(),
   accept: vi.fn(),
   dismiss: vi.fn(),
   queue: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      triage: {
         suggestion: apiMocks.suggestion,
         accept: apiMocks.accept,
         dismiss: apiMocks.dismiss,
         queue: apiMocks.queue,
      },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo', teamId: 'ENG' }) }));

import { TriageSuggestionsQueue } from '@/components/common/issues/triage/triage-suggestions-queue';
import { TriageSuggestionCard } from '@/components/common/issues/triage/triage-suggestion-card';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';

const SUGGESTION: TriageSuggestionDto = {
   issueId: 'i1',
   source: 'ai',
   teamId: 'ENG',
   priorityId: 'high',
   labelIds: ['bug'],
   duplicates: [],
   summary: 'Resumo.',
   createdAt: '2026-01-01T00:00:00.000Z',
   appliedAt: null,
   dismissedAt: null,
};

const triageStatus = status.find((s) => s.category === 'triage') ?? status[0];
const otherStatus = status.find((s) => s.category !== 'triage')!;

function issue(id: string, teamId: string, st = triageStatus) {
   return {
      id,
      identifier: `${teamId}-${id}`,
      teamId,
      title: id,
      status: st,
   } as never;
}

beforeEach(() => {
   vi.useRealTimers();
   vi.clearAllMocks();
   useCatalogStore.setState({ statuses: status, priorities, labels });
   useWorkspaceStore.setState({ teams: [{ id: 'ENG', name: 'Engineering' }] as never, users: [] });
   useIssuesStore.setState({
      issues: [issue('i1', 'ENG'), issue('x1', 'OPS'), issue('e2', 'ENG', otherStatus)],
   });
});

function fire(id?: string) {
   act(() => {
      window.dispatchEvent(new CustomEvent(ISSUE_CHANGED_EVENT, { detail: { id } }));
   });
}

describe('fila de triagem (#28)', () => {
   it('ignora evento de issue de outro time ou fora da triagem; recarrega pelos da fila', async () => {
      apiMocks.queue.mockResolvedValue([SUGGESTION]);
      render(<TriageSuggestionsQueue />);
      await screen.findByText('Suggested');
      expect(apiMocks.queue).toHaveBeenCalledTimes(1);

      fire('x1'); // outro time
      fire('e2'); // mesmo time, fora da triagem e fora da fila
      await new Promise((r) => setTimeout(r, 500));
      expect(apiMocks.queue).toHaveBeenCalledTimes(1);

      fire('i1'); // card da fila
      await waitFor(() => expect(apiMocks.queue).toHaveBeenCalledTimes(2), { timeout: 1500 });
   });

   it('issue nova (ainda fora do store) recarrega — pode ter entrado na fila', async () => {
      apiMocks.queue.mockResolvedValue([SUGGESTION]);
      render(<TriageSuggestionsQueue />);
      await screen.findByText('Suggested');
      fire('nova');
      await waitFor(() => expect(apiMocks.queue).toHaveBeenCalledTimes(2), { timeout: 1500 });
   });

   it('card não re-hidrata no meio da edição quando a fila recarrega', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<TriageSuggestionCard issueId="i1" initial={SUGGESTION} />);
      await screen.findByText('Suggested');
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.click(screen.getByRole('button', { name: 'Bug', pressed: true }));

      // A fila recarregou: mesmo card, objeto novo.
      rerender(<TriageSuggestionCard issueId="i1" initial={{ ...SUGGESTION }} />);

      expect(screen.getByRole('button', { name: 'Done editing' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Bug', pressed: false })).toBeTruthy();
   });

   it('card alimentado pela fila não faz GET próprio em evento da issue', async () => {
      render(<TriageSuggestionCard issueId="i1" initial={SUGGESTION} />);
      await screen.findByText('Suggested');
      fire('i1');
      fire();
      await new Promise((r) => setTimeout(r, 50));
      expect(apiMocks.suggestion).not.toHaveBeenCalled();
   });
});
