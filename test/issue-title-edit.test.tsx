// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { status } from './helpers/catalog-fixture';
import { priorities } from '@/data/priorities';

/**
 * is#11: editar o título pulava 64 px (textarea rows=1 sem autosize) e Shift+Enter
 * gravava um \n no título.
 */

const apiMocks = vi.hoisted(() => ({
   issues: {
      detail: vi.fn(),
      activity: vi.fn(async () => []),
      updateDetail: vi.fn(),
      update: vi.fn(async () => ({})),
   },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/components/common/editor/block-editor', () => ({ BlockEditor: () => null }));
vi.mock('@/components/common/issues/details/activity-feed', () => ({ ActivityFeed: () => null }));
vi.mock('@/components/common/issues/details/issue-properties-panel', () => ({
   IssuePropertiesPanel: () => null,
}));
vi.mock('@/components/common/detail-side-panel', () => ({
   DetailSidePanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
   DetailSidePanelTrigger: () => null,
}));

const dto = {
   identifier: 'CORE-1',
   description: '',
   descriptionDoc: null,
   descriptionVersion: 'v1',
   parent: null,
   subIssues: [],
   subIssueIds: [],
   relatedIds: [],
   blockedByIds: [],
   blockingIds: [],
   duplicateIds: [],
   prLinks: [],
   attachments: [],
};

const issue: Issue = {
   id: 'a',
   identifier: 'CORE-1',
   teamId: 'CORE',
   title: 'Título original',
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: 'a1',
};

async function openTitleEditor() {
   const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
   apiMocks.issues.detail.mockResolvedValue(dto);
   const user = userEvent.setup();
   render(<IssueDetailView issue={issue} />);
   await user.click(await screen.findByRole('heading', { name: 'Título original' }));
   return { user, box: screen.getByRole('textbox', { name: 'Issue title' }) as HTMLTextAreaElement };
}

beforeEach(() => vi.clearAllMocks());

describe('editar o título da issue (is#11)', () => {
   it('cresce com o conteúdo em vez de pular de altura', async () => {
      const { box } = await openTitleEditor();
      expect(box.className).toMatch(/field-sizing-content/);
      expect(box.rows).toBeGreaterThan(0);
   });

   it('Shift+Enter salva e não grava quebra de linha', async () => {
      const { user, box } = await openTitleEditor();
      await user.clear(box);
      await user.type(box, 'Novo título');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      expect(box.value).not.toContain('\n');
      await waitFor(() => expect(apiMocks.issues.update).toHaveBeenCalled());
      expect(apiMocks.issues.update.mock.calls[0][1]).toEqual({ title: 'Novo título' });
   });

   it('texto colado com quebras vira uma linha só', async () => {
      const { user, box } = await openTitleEditor();
      await user.clear(box);
      await user.paste('Linha um\nLinha dois');
      expect(box.value).toBe('Linha um Linha dois');
   });
});
