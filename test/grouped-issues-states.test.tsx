// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { status } from './helpers/catalog-fixture';
import { useDisplaySettingsStore } from '@/store/display-settings-store';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/CORE/all',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

/**
 * #9: no board, toda coluna vazia ia para "Hidden columns" — sem issues, o board nunca
 * mostrava carregando/erro/vazio. O carregando (lista e board) é o loading padrão do
 * Circle (`CircleLoading` via `LoadingArea`), com a altura reservada das linhas.
 */

const view = (props: {
   grid: boolean;
   loading?: boolean;
   error?: boolean;
   onRetry?: () => void;
}) => (
   <GroupedIssuesView
      issues={[]}
      totalIssues={[]}
      statuses={status}
      isViewTypeGrid={props.grid}
      loading={props.loading}
      error={props.error}
      onRetry={props.onRetry}
   />
);

const loadingStatus = () => screen.getByRole('status', { name: 'Carregando' });

describe('estados sem issues da lista e do board', () => {
   beforeEach(() => {
      useDisplaySettingsStore.setState({ byView: {} });
   });

   it('board carregando mostra o loading do Circle, não "Hidden columns"', () => {
      render(view({ grid: true, loading: true }));
      expect(screen.queryByText('Hidden columns')).toBeNull();
      expect(loadingStatus().querySelector('[data-part="arc"]')).not.toBeNull();
   });

   it('board com falha mostra o erro com retry', async () => {
      const onRetry = vi.fn();
      render(view({ grid: true, error: true, onRetry }));
      expect(screen.queryByText('Hidden columns')).toBeNull();
      expect(screen.getByText('Não foi possível carregar as issues.')).toBeTruthy();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
   });

   it('board vazio de verdade mostra "Nenhuma issue"', () => {
      render(view({ grid: true }));
      expect(screen.queryByText('Hidden columns')).toBeNull();
      expect(screen.getByText('Nenhuma issue')).toBeTruthy();
   });

   it('lista carregando reserva a altura das linhas no topo, com o loading do Circle', () => {
      render(view({ grid: false, loading: true }));
      const wrapper = loadingStatus().closest('[data-testid="issues-loading"]') as HTMLElement;
      expect(wrapper).toBeTruthy();
      expect(wrapper.className).not.toContain('items-center');
      expect((loadingStatus().parentElement as HTMLElement).style.minHeight).toBe('352px');
   });
});
