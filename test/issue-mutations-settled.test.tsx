// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleSelector } from '@/components/common/issues/cycle-selector';
import type { Cycle } from '@/data/cycles';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const updateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({ api: { issues: { update: updateMock } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const issue: Issue = {
   id: 'i1',
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
const cycle = { id: 'c1', name: 'Cycle 7', teamId: 'ENG' } as Cycle;

/** Is#13: o store faz rollback + toast.error e RE-LANÇA; quem chama não pode deixar solto. */
const unhandled = vi.fn();
beforeEach(() => {
   unhandled.mockReset();
   process.on('unhandledRejection', unhandled);
   updateMock.mockRejectedValue(new Error('offline'));
   useIssuesStore.setState({ issues: [issue] });
   useWorkspaceStore.setState({ cycles: [cycle] });
});
afterEach(() => {
   process.off('unhandledRejection', unhandled);
});

describe('Is#13 mutações da issue sem promise solta', () => {
   it('cycle selector: falha da API reverte sem unhandled rejection', async () => {
      const user = userEvent.setup();
      render(<CycleSelector issue={issue} />);
      await user.click(screen.getByRole('button', { name: /No cycle/ }));
      await user.click(await screen.findByText('Cycle 7'));

      await waitFor(() => expect(updateMock).toHaveBeenCalled());
      await waitFor(() => expect(useIssuesStore.getState().issues[0].cycleId).toBe(''));
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
   });
});
