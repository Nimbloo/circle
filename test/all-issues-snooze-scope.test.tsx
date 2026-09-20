// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';

/**
 * is#23: issue de triagem adiada (snooze) sumia de "All issues" (categories=undefined),
 * não só da fila de Triage — sem jeito de ver ou desfazer o snooze. O filtro de snooze
 * agora só se aplica à visão escopada em triage.
 */

const shown = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'ENG' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('@/components/common/issues/issue-filter-bar', () => ({ IssueFilterBar: () => null }));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('@/components/common/issues/grouped-issues-view', () => ({
   GroupedIssuesView: ({ issues }: { issues: Issue[] }) => {
      shown.ids = issues.map((i) => i.id);
      return null;
   },
}));

const triage = status.find((s) => s.id === 'triage')!;
const todo = status.find((s) => s.id === 'to-do')!;

const make = (id: string, over: Partial<Issue> = {}): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: id,
   description: '',
   status: todo,
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
   ...over,
});

describe('AllIssues — escopo do snooze de triage (is#23)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      seedCatalog();
      useIssuesStore.setState({
         issues: [
            make('a', { status: todo }),
            make('b', {
               status: triage,
               snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(),
            }),
         ],
         loading: false,
         loaded: true,
         error: false,
      });
   });

   it('a fila de Triage (categories=["triage"]) esconde a issue adiada', async () => {
      const { default: AllIssues } = await import('@/components/common/issues/all-issues');
      render(<AllIssues categories={['triage']} />);
      expect(shown.ids).toEqual([]);
   });

   it('"All issues" (sem categories) continua mostrando a issue adiada', async () => {
      const { default: AllIssues } = await import('@/components/common/issues/all-issues');
      render(<AllIssues />);
      expect(shown.ids.sort()).toEqual(['a', 'b']);
   });
});
