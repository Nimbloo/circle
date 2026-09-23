// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review } from '@/data/reviews';

const fetchReviews = vi.fn();
const fetchReview = vi.fn();
const addReviewComment = vi.fn();
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReviews: (...args: unknown[]) => fetchReviews(...args),
   fetchReview: (...args: unknown[]) => fetchReview(...args),
   addReviewComment: (...args: unknown[]) => addReviewComment(...args),
   latestVerdict: () => null,
   syncReviews: vi.fn(),
   fetchReviewedPaths: vi.fn().mockResolvedValue([]),
   setReviewFileState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => null }));
// As seções do detalhe não interessam aqui (o que se mede é fetch/remontagem).
vi.mock('@/components/common/reviews/review-overview', () => ({
   ReviewOverview: () => <div>overview-section</div>,
}));
vi.mock('@/components/common/reviews/review-diff', () => ({
   ReviewDiff: () => <div>diff-section</div>,
}));
vi.mock('@/components/common/reviews/review-guide', () => ({
   ReviewGuide: () => <div>guide-section</div>,
}));

const nav = vi.hoisted(() => ({
   pathname: '/nimbloo/reviews',
   search: '',
   params: { orgId: 'nimbloo' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
   useParams: () => nav.params,
   usePathname: () => nav.pathname,
   useSearchParams: () => new URLSearchParams(nav.search),
}));

import { ReviewsShell } from '@/components/common/reviews/reviews-shell';
import { REVIEW_CHANGED_EVENT } from '@/lib/use-live-sync';

const review = (n: number, status: Review['status'] = 'open'): Review =>
   ({
      id: `x/y#${n}`,
      title: `PR ${n}`,
      status,
      list: 'for-you',
      timeAgo: '1h',
      createdAt: '2026-09-01T00:00:00.000Z',
      repo: 'x/y',
      prNumber: n,
      targetBranch: 'main',
      sourceBranch: 'b',
      additions: 1,
      deletions: 0,
      resolves: { identifier: '', title: '' },
      checksPassed: 0,
      checksTotal: 0,
      files: [],
      commits: [],
      summary: [],
      testPlan: [],
      guide: null,
      comments: [],
      verdict: null,
   }) as Review;

const page = (from: number, count: number, total: number) => ({
   reviews: Array.from({ length: count }, (_, i) => review(from + i)),
   total,
   limit: count,
   offset: from,
});

function go(pathname: string, search = '', params: Record<string, string> = {}) {
   nav.pathname = pathname;
   nav.search = search;
   nav.params = { orgId: 'nimbloo', ...params };
}

beforeEach(() => {
   fetchReviews.mockReset();
   fetchReview.mockReset();
   go('/nimbloo/reviews');
});
afterEach(() => vi.useRealTimers());

describe('reviews: lista persistente entre rotas (#8)', () => {
   it('abrir um PR e trocar de seção não refaz a lista nem o detalhe', async () => {
      fetchReviews.mockResolvedValue(page(1, 3, 3));
      fetchReview.mockResolvedValue(review(1));
      const { rerender } = render(<ReviewsShell />);
      await screen.findByText('PR 1');

      go('/nimbloo/review/x%2Fy%231', '', { reviewId: 'x%2Fy%231' });
      rerender(<ReviewsShell />);
      await screen.findByText('overview-section');

      go('/nimbloo/review/x%2Fy%231/changes', '', { reviewId: 'x%2Fy%231' });
      rerender(<ReviewsShell />);
      await screen.findByText('diff-section');

      expect(fetchReviews).toHaveBeenCalledTimes(1);
      expect(fetchReview).toHaveBeenCalledTimes(1);
      expect(fetchReview).toHaveBeenCalledWith('x/y#1');
   });

   it('`?list=created` no detalhe mantém a aba Created e os links a preservam', async () => {
      go('/nimbloo/review/x%2Fy%231', 'list=created', { reviewId: 'x%2Fy%231' });
      fetchReviews.mockResolvedValue(page(1, 2, 2));
      fetchReview.mockResolvedValue(review(1));
      render(<ReviewsShell />);
      await screen.findByText('PR 2');
      expect(fetchReviews.mock.calls[0][0]).toMatchObject({ list: 'created' });
      const row = screen.getByText('PR 2').closest('a')!;
      expect(row.getAttribute('href')).toBe('/nimbloo/review/x%2Fy%232?list=created');
      const diffTab = await screen.findByRole('link', { name: 'Diff' });
      expect(diffTab.getAttribute('href')).toBe('/nimbloo/review/x%2Fy%231/changes?list=created');
   });
});

describe('reviews: tempo real sem apagar o "carregar mais" (#48)', () => {
   it('rajada de eventos = um refetch, com limit = carregados', async () => {
      fetchReviews.mockResolvedValueOnce(page(1, 50, 120));
      fetchReviews.mockResolvedValueOnce(page(51, 50, 120));
      render(<ReviewsShell />);
      await screen.findByText('PR 1');
      fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
      await screen.findByText('PR 100');

      fetchReviews.mockResolvedValue(page(1, 100, 120));
      act(() => {
         for (let i = 0; i < 5; i++) window.dispatchEvent(new CustomEvent(REVIEW_CHANGED_EVENT));
      });
      await waitFor(() => expect(fetchReviews).toHaveBeenCalledTimes(3), { timeout: 3000 });
      expect(fetchReviews.mock.calls[2][0]).toMatchObject({ limit: 100, offset: 0 });
      await new Promise((r) => setTimeout(r, 800));
      expect(fetchReviews).toHaveBeenCalledTimes(3);
      expect(screen.getByText('PR 100')).toBeTruthy();
   });

   it('filtro de status vai para o servidor', async () => {
      fetchReviews.mockResolvedValue(page(1, 2, 2));
      render(<ReviewsShell />);
      await screen.findByText('PR 1');
      fireEvent.click(screen.getByRole('button', { name: 'Filter reviews' }));
      fireEvent.click(await screen.findByText('Closed'));
      await waitFor(() =>
         expect(fetchReviews).toHaveBeenLastCalledWith(
            expect.objectContaining({ statuses: ['open', 'merged'] })
         )
      );
   });

   it('eco da própria ação no detalhe não refaz o fetch', async () => {
      go('/nimbloo/review/x%2Fy%231', '', { reviewId: 'x%2Fy%231' });
      fetchReviews.mockResolvedValue(page(1, 1, 1));
      fetchReview.mockResolvedValue(review(1));
      addReviewComment.mockResolvedValue({
         id: 'c1',
         author: null,
         path: null,
         line: null,
         kind: 'approve',
         body: '',
         createdAt: '2026-09-01T00:00:00.000Z',
         timeAgo: 'now',
      });
      render(<ReviewsShell />);
      fireEvent.click(await screen.findByRole('button', { name: /Approve/ }));
      await waitFor(() => expect(addReviewComment).toHaveBeenCalled());
      act(() => {
         window.dispatchEvent(new CustomEvent(REVIEW_CHANGED_EVENT, { detail: { id: 'x/y#1' } }));
      });
      await new Promise((r) => setTimeout(r, 800));
      expect(fetchReview).toHaveBeenCalledTimes(1);
   });
});
