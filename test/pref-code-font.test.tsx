// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Review } from '@/data/reviews';
import { ReviewDiff } from '@/components/common/reviews/review-diff';
import type { ReviewCommentsHandle } from '@/components/common/reviews/review-comments';
import { usePreferencesStore } from '@/store/preferences-store';

vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const review = {
   id: 'x/y#1',
   files: [
      {
         name: 'a.ts',
         path: 'src',
         additions: 1,
         deletions: 0,
         category: 'implementation',
         patch: '@@ -1,2 +1,2 @@\n line 0\n line 1',
      },
   ],
   commits: [],
   comments: [],
} as unknown as Review;

const handle: ReviewCommentsHandle = {
   reviewId: 'x/y#1',
   meId: 'u1',
   isAdmin: false,
   mutate: () => {},
   setFileReviewed: async () => {},
};

const codeBlock = () => screen.getByText('line 1').closest('.font-mono') as HTMLElement;

describe('preferência "Font" de código (Code & reviews)', () => {
   it('12px regular por padrão; 13px medium quando escolhido, sem recarregar', () => {
      act(() => usePreferencesStore.getState().setPref('codeFont', '12px, Regular, Default'));
      render(<ReviewDiff review={review} handle={handle} />);
      expect(codeBlock().className).toContain('text-xs');
      expect(codeBlock().className).not.toContain('font-medium');

      act(() => usePreferencesStore.getState().setPref('codeFont', '13px, Medium'));
      expect(codeBlock().className).toContain('text-[13px]');
      expect(codeBlock().className).toContain('font-medium');
   });
});
