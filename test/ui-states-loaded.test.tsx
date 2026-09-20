// @vitest-environment jsdom

import './setup-dom';
import React, { Suspense } from 'react';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cycle } from '@/data/cycles';

vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 't-eng' }),
   useRouter: () => ({ push: vi.fn() }),
   usePathname: () => '/nimbloo/team/t-eng/cycle/active',
}));
// A lista em si é da frente de issues; aqui só interessa o que a tela repassa a ela.
vi.mock('@/components/common/issues/grouped-issues-view', () => ({
   GroupedIssuesView: (props: { loading?: boolean; error?: boolean; onRetry?: () => void }) => (
      <div
         data-testid="grouped"
         data-loading={String(Boolean(props.loading))}
         data-error={String(Boolean(props.error))}
      >
         {props.onRetry && <button onClick={props.onRetry}>retry</button>}
      </div>
   ),
}));
vi.mock('@/components/common/issues/issue-filter-bar', () => ({ IssueFilterBar: () => null }));
vi.mock('@/components/common/detail-side-panel', () => ({ DetailSidePanel: () => null }));
vi.mock('@/components/layout/headers/profile/header', () => ({ default: () => null }));

import Cycles from '@/components/common/cycles/cycles';
import CycleIssues from '@/components/common/issues/cycle-issues';
import MemberProfilePage from '@/app/[orgId]/profiles/[memberId]/page';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: NuqsTestingAdapter });

const cycle: Cycle = {
   id: 'c1',
   number: 1,
   name: 'Cycle 1',
   teamId: 't-eng',
   status: 'current',
   startDate: '2026-09-14',
   endDate: '2026-09-28',
   capacity: 0,
   scope: 0,
   scopeDelta: 0,
   started: 0,
   completed: 0,
};

beforeEach(() => {
   useWorkspaceStore.setState({ loaded: false, cycles: [], users: [] });
   useIssuesStore.setState({ issues: [], loading: false, error: false });
});

describe('Cycles', () => {
   it('não mostra o vazio antes da primeira carga do workspace', () => {
      render(<Cycles />);
      expect(screen.queryByText('No cycles yet')).toBeNull();
      expect(screen.getByTestId('cycles-loading')).toBeTruthy();
   });

   it('mostra o vazio depois de carregado', () => {
      useWorkspaceStore.setState({ loaded: true });
      render(<Cycles />);
      expect(screen.getByText('No cycles yet')).toBeTruthy();
   });
});

describe('CycleIssues', () => {
   it('repassa loading/error/onRetry da lista de issues', () => {
      const hydrate = vi.fn(async () => {});
      useWorkspaceStore.setState({ loaded: true, cycles: [cycle] });
      useIssuesStore.setState({ loading: false, error: true, hydrate });
      render(<CycleIssues cycleView="active" />);
      const grouped = screen.getByTestId('grouped');
      expect(grouped.dataset.error).toBe('true');
      fireEvent.click(screen.getByText('retry'));
      expect(hydrate).toHaveBeenCalled();

      act(() => useIssuesStore.setState({ loading: true, error: false }));
      expect(screen.getByTestId('grouped').dataset.loading).toBe('true');
   });

   it('sem ciclo ativo depois de carregado mostra um vazio próprio', () => {
      useWorkspaceStore.setState({ loaded: true, cycles: [] });
      render(<CycleIssues cycleView="active" />);
      expect(screen.getByText('No active cycle')).toBeTruthy();
      expect(screen.queryByTestId('grouped')).toBeNull();
   });

   it('sem ciclo e sem carga ainda não afirma que não há ciclo', () => {
      render(<CycleIssues cycleView="upcoming" />);
      expect(screen.queryByText('No upcoming cycle')).toBeNull();
      expect(screen.queryByTestId('grouped')).toBeNull();
   });
});

describe('perfil de membro', () => {
   async function renderPage() {
      const params = Promise.resolve({ memberId: 'u-x' });
      await act(async () => {
         render(
            <Suspense fallback={null}>
               <MemberProfilePage params={params} />
            </Suspense>
         );
         await params;
      });
   }

   it('carregando usa o loading do Circle, não texto cru', async () => {
      await renderPage();
      expect(screen.queryByText('Carregando…')).toBeNull();
      const loading = screen.getByTestId('profile-loading');
      expect(loading.querySelector('[data-part="arc"]')).not.toBeNull();
   });

   it('membro inexistente depois de carregado mostra EmptyState', async () => {
      useWorkspaceStore.setState({ loaded: true });
      await renderPage();
      expect(screen.getByRole('status').textContent).toContain('Member not found');
   });
});
