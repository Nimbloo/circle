// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ slackConfig: vi.fn(), updateSlackConfig: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { integrations: apiMocks },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { SlackEventsConfig } = await import('@/components/common/settings/slack-events-config');

const base = {
   onIssueCreated: false,
   onIssueCompleted: false,
   onIssueAssigned: false,
   onPrMerged: false,
};

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.slackConfig.mockResolvedValue(base);
});

function deferred<T>() {
   let resolve!: (v: T) => void;
   let reject!: (e: unknown) => void;
   const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
   });
   return { promise, resolve, reject };
}

/** Ad#36 — o rollback restaurava o objeto inteiro e desfazia o toggle de outro campo. */
describe('SlackEventsConfig (Ad#36)', () => {
   it('falha de um toggle reverte só o campo dele', async () => {
      const user = userEvent.setup();
      const first = deferred<typeof base>();
      const second = deferred<typeof base>();
      apiMocks.updateSlackConfig
         .mockReturnValueOnce(first.promise)
         .mockReturnValueOnce(second.promise);
      render(<SlackEventsConfig />);

      const created = await screen.findByRole('switch', { name: 'Issue criada' });
      const assigned = screen.getByRole('switch', { name: 'Issue atribuída' });
      await user.click(created);
      await user.click(assigned);

      // O 2º grava primeiro (servidor devolve o estado com os dois campos), o 1º falha.
      second.resolve({ ...base, onIssueAssigned: true });
      first.reject(new Error('403'));

      await waitFor(() => expect(created.getAttribute('data-state')).toBe('unchecked'));
      expect(assigned.getAttribute('data-state')).toBe('checked');
   });
});
