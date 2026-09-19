// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { VirtualIssueList } from '@/components/common/issues/virtual-issue-list';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * is#14: voltar do detalhe para a lista perdia a posição do scroll — a lista recomeçava
 * do topo. O offset é guardado por view.
 */

const path = vi.hoisted(() => ({ value: '/nimbloo/team/ENG/all' }));
vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => path.value,
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const make = (n: number): Issue => ({
   id: `i${n}`,
   identifier: `ENG-${n}`,
   title: `Issue ${n}`,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: String(n),
   teamId: 'ENG',
});

const entries = [
   {
      group: { id: 'g1', name: 'Todo', icon: null },
      issues: Array.from({ length: 200 }, (_, n) => make(n + 1)),
   },
];

beforeEach(() => {
   seedCatalog();
   path.value = '/nimbloo/team/ENG/all';
   useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
   useIssuesStore.setState({ issues: entries[0].issues });
});

function renderList() {
   const utils = render(
      <div style={{ height: 400 }}>
         <VirtualIssueList entries={entries} />
      </div>
   );
   const scroller = utils.container.querySelector('.overflow-y-auto') as HTMLElement;
   Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
   Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 8000 });
   return { ...utils, scroller };
}

describe('scroll da lista virtual (is#14)', () => {
   it('volta para a mesma posição ao remontar a mesma view', () => {
      const first = renderList();
      act(() => {
         first.scroller.scrollTop = 1200;
         fireEvent.scroll(first.scroller);
      });
      first.unmount();

      const second = renderList();
      expect(second.scroller.scrollTop).toBe(1200);
   });

   it('view diferente começa do topo', () => {
      const first = renderList();
      act(() => {
         first.scroller.scrollTop = 900;
         fireEvent.scroll(first.scroller);
      });
      first.unmount();

      path.value = '/nimbloo/team/OPS/all';
      const second = renderList();
      expect(second.scroller.scrollTop).toBe(0);
   });
});
