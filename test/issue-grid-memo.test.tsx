// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { IssueGrid } from '@/components/common/issues/issue-grid';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const renders = vi.hoisted(() => new Map<string, number>());

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
// Conta os renders de cada card pelo filho que recebe a issue.
vi.mock('@/components/common/issues/sla-badge', () => ({
   SlaBadge: ({ issue }: { issue: Issue }) => {
      renders.set(issue.id, (renders.get(issue.id) ?? 0) + 1);
      return null;
   },
}));

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

/** Mesmo uso da coluna do board: re-renderiza a cada mudança do store. */
function Column() {
   const issues = useIssuesStore((s) => s.issues);
   const latest = React.useRef(issues);
   latest.current = issues;
   const getGroup = React.useCallback(
      () => ({ group: { id: 'g', name: 'G', icon: null }, issues: latest.current }),
      []
   );
   return (
      <>
         {issues.map((issue) => (
            <IssueGrid key={issue.id} issue={issue} getGroup={getGroup} layout={false} />
         ))}
      </>
   );
}

describe('#2 card do board memoizado', () => {
   beforeEach(() => {
      renders.clear();
      useIssuesStore.setState({ issues: [make('a', 'a'), make('b', 'b')] });
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [], teams: [] });
   });

   it('mudança em outra issue não re-renderiza o card', () => {
      render(
         <DndProvider backend={HTML5Backend}>
            <Column />
         </DndProvider>
      );
      const before = renders.get('a');
      act(() => {
         useIssuesStore.setState((s) => ({
            issues: s.issues.map((i) => (i.id === 'b' ? { ...i, title: 'Editada' } : i)),
         }));
      });
      expect(renders.get('a')).toBe(before);
      expect(renders.get('b')).toBeGreaterThan(1);
   });
});
