// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkActionsBar } from '@/components/common/issues/bulk-actions-bar';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Auditoria de toasts (item 2): a confirmação dizia "não pode ser desfeita… removida
 * permanentemente" e logo depois aparecia o Undo (no lote, nem havia Undo — o mesmo lote
 * pelo ⌘⌫ tinha). Agora o lote usa a mesma exclusão com Undo e o texto diz isso.
 */

const apiMocks = vi.hoisted(() => ({ remove: vi.fn(async () => ({ deleted: true })) }));
vi.mock('@/lib/client', () => ({ api: { issues: { remove: apiMocks.remove } } }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const make = (id: string): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: id,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
});

beforeEach(() => {
   seedCatalog();
   vi.clearAllMocks();
   useIssuesStore.setState({
      issues: [make('a'), make('b'), make('c')],
      remoteDeletedIds: new Set(),
   });
   useWorkspaceStore.setState({ users: [], projects: [], cycles: [], teams: [] });
   act(() => useBulkSelectionStore.getState().set(['a', 'b']));
});

describe('excluir em lote pela barra', () => {
   it('texto coerente com o Undo e exclusão com janela de desfazer', async () => {
      render(<BulkActionsBar />);
      const u = userEvent.setup();
      await u.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).not.toMatch(/não pode ser desfeita|permanentemente/);
      expect(dialog.textContent).toMatch(/desfazer/i);

      await u.click(screen.getByRole('button', { name: 'Delete' }));
      expect(useIssuesStore.getState().issues.map((i) => i.id)).toEqual(['c']);
      expect(apiMocks.remove).not.toHaveBeenCalled();
      const opts = toastMock.mock.calls.at(-1)?.[1] as { action?: { label: string } };
      expect(opts.action?.label).toBe('Undo');
      expect(useBulkSelectionStore.getState().selected.size).toBe(0);
   });
});
