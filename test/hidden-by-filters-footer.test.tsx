// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { useDisplaySettingsStore } from '@/store/display-settings-store';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/CORE/all',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({
      filters: [{ type: 'status', value: 'to-do' }],
      setFilters: () => {},
      clearFilters: () => {},
   }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
vi.mock('@tanstack/react-virtual', () => ({
   useVirtualizer: (opts: { count: number; getItemKey?: (i: number) => React.Key }) => ({
      getTotalSize: () => opts.count * 44,
      getVirtualItems: () =>
         Array.from({ length: opts.count }, (_, index) => ({
            index,
            key: opts.getItemKey ? opts.getItemKey(index) : index,
            start: index * 44,
         })),
      measureElement: () => {},
      scrollToIndex: () => {},
   }),
}));

const byId = (id: string) => status.find((s) => s.id === id)!;
const make = (n: number, statusId: string, parentId: string | null = null): Issue => ({
   id: `i${n}`,
   identifier: `CORE-${n}`,
   title: `Issue ${n}`,
   description: '',
   status: byId(statusId),
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: `a${n}`,
   teamId: 'CORE',
   parentId,
});

// Escopo: 1 todo (visível), 1 em progresso (escondida pelo filtro), 1 done e 1 sub-issue
// (escondidas pelas opções de display, não pelo filtro).
const scope = [make(1, 'to-do'), make(2, 'in-progress'), make(3, 'done'), make(4, 'to-do', 'i1')];
const filtered = [scope[0], scope[3]];

describe('Is#18 rodapé "hidden by filters"', () => {
   beforeEach(() => {
      useDisplaySettingsStore.setState({ byView: {} });
      const s = useDisplaySettingsStore.getState();
      s.setCompletedIssues('team/CORE/all', 'none');
      s.setShowSubIssues('team/CORE/all', false);
   });

   it('conta só o que o FILTRO escondeu, não o que as opções de display escondem', () => {
      render(
         <GroupedIssuesView
            issues={filtered}
            totalIssues={scope}
            statuses={status}
            isViewTypeGrid={false}
         />
      );
      expect(screen.getByText(/hidden by filters/).textContent).toMatch(/^1 issue hidden/);
   });

   it('sem nada escondido pelo filtro, o rodapé não aparece', () => {
      render(
         <GroupedIssuesView
            issues={[scope[0], scope[1], scope[3]]}
            totalIssues={scope}
            statuses={status}
            isViewTypeGrid={false}
         />
      );
      expect(screen.queryByText(/hidden by filters/)).toBeNull();
   });
});
