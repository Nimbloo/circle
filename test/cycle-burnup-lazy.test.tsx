// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Cycle } from '@/data/cycles';

const chart = vi.hoisted(() => ({ loaded: false }));

// Módulo que carrega o recharts: marcar quando alguém o importa.
vi.mock('@/components/common/cycles/cycle-burnup-chart', () => {
   chart.loaded = true;
   return { CycleBurnupChart: () => <div data-testid="burnup-chart" /> };
});
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/CORE/cycles',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
   useSearchParams: () => new URLSearchParams(),
}));

import { CycleDetailsPanel } from '@/components/common/cycles/cycle-details-panel';

const upcoming: Cycle = {
   id: 'c2',
   number: 2,
   name: 'Cycle 2',
   teamId: 'CORE',
   status: 'upcoming',
   startDate: '2026-10-01',
   endDate: '2026-10-14',
   capacity: 0,
   scope: 3,
   scopeDelta: 0,
   started: 0,
   completed: 0,
   burnup: [],
};

describe('burn-up sob demanda (Pl#22)', () => {
   it('ciclo upcoming sem série não baixa o recharts', async () => {
      render(<CycleDetailsPanel cycle={upcoming} issues={[]} />, { wrapper: NuqsTestingAdapter });
      expect(screen.getByText('No progress data yet')).toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(chart.loaded).toBe(false);
   });
});
