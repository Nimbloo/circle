// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review } from '@/data/reviews';
import type { ReviewCommentsHandle } from '@/components/common/reviews/review-comments';

/**
 * "Reviewed" do diff no detalhe: o set do servidor não pode ser substituído por um
 * parcial (toggle antes do GET) nem por um GET que saiu antes do toggle.
 */
const mocks = vi.hoisted(() => ({
   fetchReview: vi.fn(),
   fetchReviewedPaths: vi.fn(),
   setReviewFileState: vi.fn(),
}));
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReview: (...a: unknown[]) => mocks.fetchReview(...a),
   fetchReviewedPaths: (...a: unknown[]) => mocks.fetchReviewedPaths(...a),
   setReviewFileState: (...a: unknown[]) => mocks.setReviewFileState(...a),
   addReviewComment: vi.fn(),
   latestVerdict: () => null,
}));
vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

// Captura o que o detalhe entrega ao diff.
const seen = vi.hoisted(() => ({
   handle: null as ReviewCommentsHandle | null,
   reviewedPaths: undefined as Set<string> | undefined,
}));
vi.mock('@/components/common/reviews/review-diff', () => ({
   ReviewDiff: (props: { handle: ReviewCommentsHandle; reviewedPaths?: Set<string> }) => {
      seen.handle = props.handle;
      seen.reviewedPaths = props.reviewedPaths;
      return <div>diff-section</div>;
   },
}));

import { ReviewDetail } from '@/components/common/reviews/review-detail';

/** Set que o diff enxerga (prop; o código antigo o levava dentro do handle). */
const paths = () =>
   seen.reviewedPaths ?? (seen.handle as { reviewedPaths?: Set<string> } | null)?.reviewedPaths;

const review = {
   id: 'x/y#1',
   title: 'PR 1',
   status: 'open',
   list: 'for-you',
   timeAgo: '1h',
   createdAt: '2026-09-01T00:00:00.000Z',
   repo: 'x/y',
   prNumber: 1,
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
} as unknown as Review;

function deferred<T>() {
   let resolve!: (v: T) => void;
   const promise = new Promise<T>((r) => (resolve = r));
   return { promise, resolve };
}

beforeEach(() => {
   vi.clearAllMocks();
   seen.handle = null;
   seen.reviewedPaths = undefined;
   mocks.fetchReview.mockResolvedValue(review);
   mocks.setReviewFileState.mockResolvedValue(undefined);
});

describe('review-detail — estado "Reviewed"', () => {
   it('toggle antes do GET não cria set parcial e a resposta antiga do GET é descartada', async () => {
      const get = deferred<string[]>();
      mocks.fetchReviewedPaths.mockReturnValue(get.promise);
      render(<ReviewDetail reviewId="x/y#1" section="diff" />);
      await screen.findByText('diff-section');

      await act(async () => {
         await seen.handle!.setFileReviewed('src/a.ts', true);
      });
      expect(paths()).toBeUndefined();

      await act(async () => {
         get.resolve(['src/b.ts']);
         await get.promise;
      });
      expect(paths()).toBeUndefined();
   });

   it('com o set carregado, o toggle soma ao que já estava revisado', async () => {
      mocks.fetchReviewedPaths.mockResolvedValue(['src/b.ts']);
      render(<ReviewDetail reviewId="x/y#1" section="diff" />);
      await screen.findByText('diff-section');
      await act(async () => {});
      expect([...(paths() ?? [])]).toEqual(['src/b.ts']);

      const handleBefore = seen.handle;
      await act(async () => {
         await seen.handle!.setFileReviewed('src/a.ts', true);
      });
      expect([...(paths() ?? [])].sort()).toEqual(['src/a.ts', 'src/b.ts']);
      expect(seen.handle).toBe(handleBefore); // handle estável: não re-renderiza todo o diff
   });

   it('API recusa: desfaz no set e rejeita para o arquivo desfazer o próprio toggle', async () => {
      mocks.fetchReviewedPaths.mockResolvedValue(['src/b.ts']);
      mocks.setReviewFileState.mockRejectedValueOnce(new Error('500'));
      render(<ReviewDetail reviewId="x/y#1" section="diff" />);
      await screen.findByText('diff-section');
      await act(async () => {});

      let rejected = false;
      await act(async () => {
         await seen.handle!.setFileReviewed('src/a.ts', true).catch(() => (rejected = true));
      });
      expect(rejected).toBe(true);
      expect([...(paths() ?? [])]).toEqual(['src/b.ts']);
   });
});
