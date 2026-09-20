// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchReviews = vi.fn();
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReviews: (...args: unknown[]) => fetchReviews(...args),
   syncReviews: vi.fn(),
}));
vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => null }));

import Reviews from '@/components/common/reviews/reviews';

beforeEach(() => {
   fetchReviews.mockReset();
});

describe('Reviews — estados', () => {
   it('falha da 1ª carga mostra ErrorState com retry', async () => {
      fetchReviews.mockRejectedValueOnce(new Error('boom'));
      fetchReviews.mockResolvedValueOnce({ reviews: [], total: 0 });
      render(<Reviews />);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Could not load reviews');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(fetchReviews).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
   });

   it('onboarding vazio é fluido (sem largura fixa)', async () => {
      fetchReviews.mockResolvedValueOnce({ reviews: [], total: 0 });
      render(<Reviews />);
      const heading = await screen.findByText('Review diffs in Circle');
      const card = heading.closest('div.flex-col.gap-6') as HTMLElement;
      expect(card.classList.contains('max-w-[540px]')).toBe(true);
      expect(card.classList.contains('w-full')).toBe(true);
      expect(card.classList.contains('w-[540px]')).toBe(false);
   });

   it('não exibe "Loading…" cru no painel de detalhe durante a carga', () => {
      fetchReviews.mockReturnValueOnce(new Promise(() => {}));
      render(<Reviews />);
      expect(screen.queryByText('Loading…')).toBeNull();
   });
});
