// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeAgo } from '@/components/common/reviews/time-ago';
import { adaptReview, adaptReviewCommit } from '@/lib/adapters-reviews';

/**
 * Co (baixa): o tempo relativo das reviews era calculado UMA vez na adaptação do DTO e
 * ficava congelado ("now" para sempre) — e cada tela tinha sua cópia de `relativeTime`.
 */
afterEach(() => vi.useRealTimers());

describe('tempo relativo que anda', () => {
   it('TimeAgo avança com o relógio da página', async () => {
      vi.useFakeTimers({ now: new Date('2026-09-18T12:00:00Z') });
      render(<TimeAgo iso="2026-09-18T11:59:30Z" />);
      expect(screen.getByText('now')).toBeTruthy();
      await act(async () => {
         await vi.advanceTimersByTimeAsync(3 * 60_000);
      });
      expect(screen.getByText('3m')).toBeTruthy();
   });

   it('o adapter preserva o ISO para a tela recalcular', () => {
      const commit = adaptReviewCommit({
         sha: 'abcdef1234',
         message: 'fix: x',
         committedAt: '2026-09-18T10:00:00Z',
      } as never);
      expect(commit.committedAt).toBe('2026-09-18T10:00:00Z');
      const review = adaptReview({
         id: 'r/x#1',
         title: 't',
         status: 'open',
         repo: 'r/x',
         prNumber: 1,
         additions: 0,
         deletions: 0,
         createdAt: '2026-09-18T09:00:00Z',
      } as never);
      expect(review.createdAt).toBe('2026-09-18T09:00:00Z');
   });
});
