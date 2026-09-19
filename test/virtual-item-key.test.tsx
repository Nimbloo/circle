// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import { useViewTypeStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';

type Opts = { count: number; getItemKey?: (index: number) => React.Key };
const captured = vi.hoisted(() => [] as { count: number; getItemKey?: (i: number) => unknown }[]);

vi.mock('@tanstack/react-virtual', () => ({
   useVirtualizer: (opts: Opts) => {
      captured.push(opts);
      return {
         getTotalSize: () => 0,
         getVirtualItems: () => [],
         measureElement: () => {},
      };
   },
}));
vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const make = (id: string, rank: string): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: `Issue ${id}`,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank,
   teamId: 'ENG',
});

const issues = [make('a', 'a'), make('b', 'b')];
const view = (grid: boolean) => (
   <GroupedIssuesView
      issues={issues}
      totalIssues={issues}
      statuses={status}
      isViewTypeGrid={grid}
   />
);

/** #3 + Is#15: linhas/cards identificados pela issue, não pelo índice. */
describe('virtualização com chave por issue', () => {
   beforeEach(() => {
      captured.length = 0;
      useDisplaySettingsStore.setState({ byView: {} });
      useIssuesStore.setState({ issues });
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [], teams: [] });
   });

   it('lista: getItemKey devolve header do grupo e id da issue', () => {
      useViewTypeStore.setState({ viewTypeByView: { 'team/ENG/all': 'list' } });
      render(view(false));
      const opts = captured.at(-1)!;
      expect(opts.getItemKey).toBeTypeOf('function');
      const keys = Array.from({ length: opts.count }, (_, i) => opts.getItemKey!(i));
      // Com o grupo na chave: agrupando por label, a mesma issue aparece em vários grupos.
      expect(keys).toContain(`issue:${status[0].id}:a`);
      expect(keys).toContain(`issue:${status[0].id}:b`);
      expect(keys[0]).toBe(`header:${status[0].id}`);
   });

   it('coluna do board: getItemKey devolve o id da issue', () => {
      useViewTypeStore.setState({ viewTypeByView: { 'team/ENG/all': 'grid' } });
      render(view(true));
      const opts = captured.find((o) => o.count === 2)!;
      expect(opts.getItemKey).toBeTypeOf('function');
      expect([opts.getItemKey!(0), opts.getItemKey!(1)].sort()).toEqual(['a', 'b']);
   });
});
