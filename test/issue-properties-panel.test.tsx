// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { makeProject } from './helpers/project-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { IssuePropertiesPanel } from '@/components/common/issues/details/issue-properties-panel';

/**
 * is#12: o projeto não era editável no detalhe. is#13: o painel misturava chips e botões
 * fantasma, raios e tamanhos. Contrato com a frente C: `circle:issue-shortcut` abre o
 * seletor correspondente.
 */

const apiMocks = vi.hoisted(() => ({
   issues: { update: vi.fn(async () => ({})), addLabel: vi.fn(), removeLabel: vi.fn() },
   projects: { milestones: vi.fn(async () => []) },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const ALPHA = makeProject({ id: 'p1', name: 'Alpha', teamId: 'ENG' });
const issue: Issue = {
   id: 'i1',
   identifier: 'ENG-1',
   title: 'Issue',
   description: '',
   status: status.find((s) => s.id === 'to-do')!,
   priority: priorities.find((p) => p.id === 'no-priority')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
};
const detail = {
   identifier: 'ENG-1',
   description: [],
   activity: [],
   subIssues: [],
} as unknown as IssueDetail;

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   useWorkspaceStore.setState({ users: [], projects: [ALPHA], cycles: [], teams: [] });
   useIssuesStore.setState({ issues: [issue] });
});

const panel = () => render(<IssuePropertiesPanel issue={issue} detail={detail} />);

describe('painel de propriedades da issue', () => {
   it('is#13: cada propriedade é uma linha com rótulo e valor', () => {
      panel();
      for (const label of [
         'Status',
         'Priority',
         'Assignee',
         'Project',
         'Cycle',
         'Estimate',
         'Labels',
         'Due date',
      ]) {
         expect(screen.getByText(label)).toBeTruthy();
      }
   });

   it('is#12: Project está sempre presente e é editável', async () => {
      const user = userEvent.setup();
      panel();
      const row = screen.getByText('Project').closest('[data-property-row]') as HTMLElement;
      const trigger = within(row).getByRole('button');
      expect(trigger.textContent).toMatch(/Add project/);
      await user.click(trigger);
      await user.click(await screen.findByText('Alpha'));
      await waitFor(() =>
         expect(apiMocks.issues.update).toHaveBeenCalledWith('i1', { projectId: 'p1' })
      );
   });

   it('propriedade vazia mostra "Add …" em vez de ficar escondida', () => {
      panel();
      const row = (name: string) =>
         (screen.getByText(name).closest('[data-property-row]') as HTMLElement).textContent ?? '';
      expect(row('Estimate')).toMatch(/Add estimate/);
      expect(row('Due date')).toMatch(/Add due date/);
      expect(row('Labels')).toMatch(/Add label/);
   });

   it('contrato com a frente C: circle:issue-shortcut abre o seletor e cancela o evento', async () => {
      panel();
      const event = new CustomEvent('circle:issue-shortcut', {
         detail: { action: 'priority' },
         cancelable: true,
      });
      act(() => {
         window.dispatchEvent(event);
      });
      expect(await screen.findByPlaceholderText('Set priority...')).toBeTruthy();
      expect(event.defaultPrevented).toBe(true);
   });

   it('ação desconhecida (sem trigger no painel) não cancela o evento', () => {
      panel();
      const event = new CustomEvent('circle:issue-shortcut', {
         detail: { action: 'nao-existe' },
         cancelable: true,
      });
      act(() => {
         window.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
   });
});
