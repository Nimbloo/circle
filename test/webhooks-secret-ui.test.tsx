// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

class FakeApiError extends Error {
   constructor(
      public readonly status: number,
      message: string
   ) {
      super(message);
   }
}
const apiMocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/client', () => ({ ApiError: FakeApiError, api: { webhooks: apiMocks } }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const { default: WebhooksSettings } = await import(
   '@/components/common/settings/webhooks-settings'
);
const { SidebarProvider } = await import('@/components/ui/sidebar');

const renderScreen = () =>
   render(
      <SidebarProvider>
         <WebhooksSettings />
      </SidebarProvider>
   );

async function createWebhook(user: ReturnType<typeof userEvent.setup>) {
   await user.click(await screen.findByRole('button', { name: /Novo webhook/ }));
   await user.type(await screen.findByLabelText('URL de destino'), 'https://x.test/hook');
   await user.click(screen.getByRole('button', { name: 'Criar webhook' }));
}

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.list.mockResolvedValue([]);
});

describe('webhooks: segredo e motivo do erro (ad#11, ad#12)', () => {
   it('o segredo não some com Esc: só fecha pelo botão', async () => {
      apiMocks.create.mockResolvedValue({
         id: 'w1',
         url: 'https://x.test/hook',
         events: ['issue.created'],
         enabled: true,
         createdAt: '2026-09-01T00:00:00Z',
         lastDelivery: null,
         secret: 'sec-123',
      });
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'clipboard', {
         configurable: true,
         value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
      renderScreen();
      await createWebhook(user);
      expect(await screen.findByText('sec-123')).toBeTruthy();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      expect(screen.getByText('sec-123')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: /Copiar e fechar/ }));
      await waitFor(() => expect(screen.queryByText('sec-123')).toBeNull());
   });

   it('falha ao copiar avisa e mantém o segredo na tela', async () => {
      apiMocks.create.mockResolvedValue({
         id: 'w2',
         url: 'https://x.test/hook',
         events: ['issue.created'],
         enabled: true,
         createdAt: '2026-09-01T00:00:00Z',
         lastDelivery: null,
         secret: 'sec-999',
      });
      const user = userEvent.setup();
      // Depois do setup: o user-event instala o próprio stub de clipboard.
      Object.defineProperty(navigator, 'clipboard', {
         configurable: true,
         value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      });
      renderScreen();
      await createWebhook(user);
      await screen.findByText('sec-999');
      await user.click(screen.getByRole('button', { name: /Copiar e fechar/ }));
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      expect(screen.getByText('sec-999')).toBeTruthy();
   });

   it('erro do servidor aparece no toast, não só o texto genérico', async () => {
      apiMocks.create.mockRejectedValue(new FakeApiError(400, 'destino privado não é permitido'));
      const user = userEvent.setup();
      renderScreen();
      await createWebhook(user);
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      expect(String(toastMocks.error.mock.calls[0][0])).toMatch(/destino privado/);
   });
});
