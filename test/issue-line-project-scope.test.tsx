// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueLine, IssueLineProjectScopeProvider } from '@/components/common/issues/issue-line';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { makeProject } from './helpers/project-fixture';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('@/lib/client', () => ({
   api: { issues: { update: vi.fn(async () => ({})) } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/project/p1/issues',
}));

const ALPHA = makeProject({ id: 'p1', name: 'Alpha' });
const BETA = makeProject({ id: 'p2', name: 'Beta' });
const todo = status.find((s) => s.id === 'to-do')!;

const makeIssue = (over: Partial<Issue> & { id: string }): Issue => ({
   identifier: `ENG-${over.id}`,
   title: `Issue ${over.id}`,
   description: '',
   status: todo,
   priority: priorities.find((p) => p.id === 'no-priority')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: over.id,
   teamId: 'ENG',
   ...over,
});

describe('IssueLine — chip de projeto e escopo do projeto atual (pl#20)', () => {
   beforeEach(() => {
      seedCatalog();
      useWorkspaceStore.setState({ users: [], projects: [ALPHA, BETA], cycles: [] });
   });

   it('sem escopo, o chip do projeto da issue aparece normalmente', () => {
      render(<IssueLine issue={makeIssue({ id: 'a', project: ALPHA })} />);
      expect(screen.getByLabelText('Change project: Alpha')).toBeTruthy();
   });

   it('no escopo do MESMO projeto (aba Issues do projeto), o chip some', () => {
      render(
         <IssueLineProjectScopeProvider projectId="p1">
            <IssueLine issue={makeIssue({ id: 'a', project: ALPHA })} />
         </IssueLineProjectScopeProvider>
      );
      expect(screen.queryByLabelText('Change project: Alpha')).toBeNull();
   });

   it('no escopo de OUTRO projeto (ex.: sub-issue de projeto diferente), o chip continua', () => {
      render(
         <IssueLineProjectScopeProvider projectId="p1">
            <IssueLine issue={makeIssue({ id: 'a', project: BETA })} />
         </IssueLineProjectScopeProvider>
      );
      expect(screen.getByLabelText('Change project: Beta')).toBeTruthy();
   });
});
