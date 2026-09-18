// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { IssueLine } from '@/components/common/issues/issue-line';
import { IssueGrid } from '@/components/common/issues/issue-grid';
import InboxIssueLine from '@/components/common/inbox/issue-line';
import type { InboxItem } from '@/data/inbox';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
// `motion.div` marcado: só deve aparecer quando há animação de layout (layoutId).
vi.mock('motion/react', async (importOriginal) => {
   const actual = await importOriginal<typeof import('motion/react')>();
   const MotionDiv = ({
      ref,
      layoutId,
      ...props
   }: React.ComponentProps<'div'> & { layoutId?: string }) => (
      <div ref={ref} data-motion={layoutId ?? ''} {...props} />
   );
   return { ...actual, motion: { ...actual.motion, div: MotionDiv } };
});

/** #41: `motion.div` sem `layoutId` pagava o runtime do motion por linha sem animar nada. */
const issue: Issue = {
   id: 'a',
   identifier: 'ENG-1',
   title: 'Issue',
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
};
const motionNodes = () => document.querySelectorAll('[data-motion]');

describe('linhas sem layoutId não usam motion.div', () => {
   beforeEach(() => {
      useIssuesStore.setState({ issues: [issue] });
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [], teams: [] });
   });

   it('linha da lista: div simples sem layoutId, motion com layoutId', () => {
      const { unmount } = render(<IssueLine issue={issue} />);
      expect(motionNodes()).toHaveLength(0);
      unmount();
      render(<IssueLine issue={issue} layoutId />);
      expect(motionNodes()).toHaveLength(1);
   });

   it('card do board virtualizado (layout=false) é div simples', () => {
      render(
         <DndProvider backend={HTML5Backend}>
            <IssueGrid issue={issue} getOrderedIssues={() => [issue]} layout={false} />
         </DndProvider>
      );
      expect(motionNodes()).toHaveLength(0);
   });

   it('linha do inbox é div simples', () => {
      const notification = {
         ...issue,
         type: 'comment',
         content: 'x',
         user: { name: 'Ana', avatarUrl: '' },
         timestamp: '2h',
         read: false,
      } as unknown as InboxItem;
      render(<InboxIssueLine notification={notification} />);
      expect(motionNodes()).toHaveLength(0);
   });
});
