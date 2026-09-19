// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@/lib/api/users';

const reviewsApi = vi.hoisted(() => ({ fetchReviews: vi.fn(), fetchReview: vi.fn() }));
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReviews: (...a: unknown[]) => reviewsApi.fetchReviews(...a),
   fetchReview: (...a: unknown[]) => reviewsApi.fetchReview(...a),
   syncReviews: vi.fn(),
}));
vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => null }));

import Reviews from '@/components/common/reviews/reviews';
import { ReviewOverview } from '@/components/common/reviews/review-overview';
import { useWorkspaceStore } from '@/store/workspace-store';

/** co#7 e co#11 — vazio sem GitHub, "Resolves" sem issue e plural de arquivos. */
beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({ me: { id: 'u1', githubLogin: null } as MeDto });
});

describe('Reviews sem handle do GitHub (co#7)', () => {
   it('explica que falta configurar o GitHub no perfil', async () => {
      reviewsApi.fetchReviews.mockResolvedValue({ reviews: [], total: 0 });
      render(<Reviews />);
      expect((await screen.findAllByText(/Configure seu GitHub/i)).length).toBeGreaterThan(0);
      const link = screen.getByRole('link', { name: /perfil/i });
      expect(link.getAttribute('href')).toBe('/nimbloo/settings/profile');
   });

   it('com handle configurado, mantém o onboarding normal', async () => {
      useWorkspaceStore.setState({ me: { id: 'u1', githubLogin: 'danilosimei' } as MeDto });
      reviewsApi.fetchReviews.mockResolvedValue({ reviews: [], total: 0 });
      render(<Reviews />);
      expect(await screen.findByText('Review diffs in Circle')).toBeTruthy();
      expect(screen.queryByText(/Configure seu GitHub/i)).toBeNull();
   });
});

const handle = { reviewId: 'r1', meId: 'u1', isAdmin: false, mutate: () => {} } as never;

const review = (over: Record<string, unknown> = {}) =>
   ({
      id: 'r1',
      title: 'Corrige o cache',
      status: 'open',
      additions: 3,
      deletions: 1,
      checksTotal: 0,
      checksPassed: 0,
      author: { id: 'u1', name: 'Ana', avatarUrl: '' },
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      resolves: { identifier: '', title: '' },
      repo: 'Nimbloo/circle',
      prNumber: 7,
      targetBranch: 'develop',
      sourceBranch: 'danilo/x',
      summary: [],
      testPlan: [],
      commits: [],
      deployment: null,
      files: [
         {
            path: '',
            name: 'pom.xml',
            additions: 1,
            deletions: 0,
            category: 'implementation',
            hunks: [],
         },
      ],
      comments: [],
      ...over,
   }) as never;

describe('Detalhe do review (co#11)', () => {
   it('sem issue vinculada não cria link morto para /issue/', () => {
      render(<ReviewOverview review={review()} handle={handle} />);
      const links = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(
         links.some((href) => href === '/nimbloo/issue/' || href === '/nimbloo/issue/null')
      ).toBe(false);
      expect(screen.getByText('No linked issue')).toBeTruthy();
   });

   it('um arquivo alterado no singular', () => {
      render(<ReviewOverview review={review()} handle={handle} />);
      expect(screen.getByText('1 file changed')).toBeTruthy();
   });

   it('dois arquivos no plural', () => {
      render(
         <ReviewOverview
            handle={handle}
            review={review({
               files: [
                  {
                     path: 'src',
                     name: 'a',
                     additions: 1,
                     deletions: 0,
                     category: 'implementation',
                     hunks: [],
                  },
                  {
                     path: 'src',
                     name: 'b',
                     additions: 1,
                     deletions: 0,
                     category: 'implementation',
                     hunks: [],
                  },
               ],
            })}
         />
      );
      expect(screen.getByText('2 files changed')).toBeTruthy();
   });
});
