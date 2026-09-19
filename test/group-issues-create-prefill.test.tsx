// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GroupIssues } from '@/components/common/issues/group-issues';
import { CreateNewIssue } from '@/components/layout/sidebar/create-new-issue';
import { priorities } from '@/data/priorities';
import { seedCatalog } from './helpers/catalog-fixture';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';

/**
 * is#24: o "+" de uma coluna do board só pré-preenchia o status — em coluna de
 * priority/assignee/project o modal abria em branco.
 */

vi.mock('@/lib/client', () => ({
   api: { teams: { templates: vi.fn(async () => []) }, issues: { create: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('@/components/common/editor/block-editor', () => ({
   BlockEditor: () => <div data-testid="block-editor" />,
}));

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
   }),
});

beforeEach(() => {
   seedCatalog();
   useCreateIssueStore.setState({ isOpen: false, defaultDrop: null });
   useWorkspaceStore.setState({ teams: [], users: [], projects: [], me: null });
   useIssuesStore.setState({ issues: [] });
});

const urgent = priorities.find((p) => p.id === 'urgent')!;

describe('"+" da coluna pré-preenche o form (is#24)', () => {
   it('coluna de priority: abre o modal já com a priority da coluna', async () => {
      const user = userEvent.setup();
      render(
         <>
            <DndProvider backend={HTML5Backend}>
               <GroupIssues
                  group={{
                     id: urgent.id,
                     name: urgent.name,
                     icon: null,
                     drop: { field: 'priority', priority: urgent },
                  }}
                  issues={[]}
                  count={0}
               />
            </DndProvider>
            <CreateNewIssue />
         </>
      );

      await user.click(screen.getByRole('button', { name: `Create issue in ${urgent.name}` }));

      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByText(urgent.name).closest('[role="combobox"]')).toBeTruthy();
   });
});
