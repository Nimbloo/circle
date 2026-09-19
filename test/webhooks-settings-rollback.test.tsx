// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});
const apiMocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/client', () => ({ api: { webhooks: apiMocks } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: WebhooksSettings } = await import(
   '@/components/common/settings/webhooks-settings'
);
const { SidebarProvider } = await import('@/components/ui/sidebar');

const hook = (id: string, enabled: boolean) => ({
   id,
   url: `https://x.test/${id}`,
   events: ['issue.created'],
   enabled,
   createdAt: '2026-09-01T00:00:00Z',
   lastDelivery: null,
});

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.list.mockResolvedValue([hook('a', true), hook('b', true)]);
});

describe('webhooks: rollback só do item (Ad#21–40)', () => {
   it('excluir que falha devolve só o webhook excluído, sem desfazer o toggle de outro', async () => {
      const user = userEvent.setup();
      let rejectRemove!: (e: unknown) => void;
      apiMocks.remove.mockReturnValue(new Promise((_, rej) => (rejectRemove = rej)));
      apiMocks.update.mockResolvedValue(hook('b', false));
      render(
         <SidebarProvider>
            <WebhooksSettings />
         </SidebarProvider>
      );
      await user.click(await screen.findByRole('button', { name: 'Excluir https://x.test/a' }));
      await user.click(await screen.findByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(screen.queryByText('https://x.test/a')).toBeNull());
      await user.click(screen.getByRole('switch', { name: 'Ativar https://x.test/b' }));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalled());
      await act(async () => rejectRemove(new Error('500')));
      await screen.findByText('https://x.test/a');
      expect(
         screen
            .getByRole('switch', { name: 'Ativar https://x.test/b' })
            .getAttribute('aria-checked')
      ).toBe('false');
   });
});
