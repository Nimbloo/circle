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
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const { SlackEventsConfig } = await import('@/components/common/settings/slack-events-config');
const { ApiError } = await import('@/lib/client');

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

/** Auditoria de toasts (item 7): carga engolida (seção sumia) e todo erro virava "Só admin". */
describe('SlackEventsConfig — erros', () => {
   it('falha na carga mostra erro com retry (a seção não some)', async () => {
      const user = userEvent.setup();
      apiMocks.slackConfig.mockRejectedValueOnce(new Error('Failed to fetch'));
      render(<SlackEventsConfig />);
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/Não foi possível carregar/);
      apiMocks.slackConfig.mockResolvedValueOnce(base);
      await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(await screen.findByRole('switch', { name: 'Issue criada' })).toBeTruthy();
   });

   it('403 mantém a mensagem de admin', async () => {
      const user = userEvent.setup();
      apiMocks.updateSlackConfig.mockRejectedValueOnce(new ApiError(403, 'Apenas admin'));
      render(<SlackEventsConfig />);
      await user.click(await screen.findByRole('switch', { name: 'Issue criada' }));
      await waitFor(() =>
         expect(toastMock.error).toHaveBeenCalledWith(
            'Só admin pode mudar as notificações do Slack'
         )
      );
   });

   it('outro erro não vira "Só admin": mostra o motivo real', async () => {
      const user = userEvent.setup();
      apiMocks.updateSlackConfig.mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'));
      render(<SlackEventsConfig />);
      await user.click(await screen.findByRole('switch', { name: 'Issue criada' }));
      await waitFor(() =>
         expect(toastMock.error).toHaveBeenCalledWith(
            'Não foi possível salvar as notificações do Slack'
         )
      );
   });
});
