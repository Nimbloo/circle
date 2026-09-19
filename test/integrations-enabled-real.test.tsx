// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const apiMocks = vi.hoisted(() => ({ status: vi.fn(), slackConfig: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { integrations: { status: apiMocks.status, slackConfig: apiMocks.slackConfig } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: Integrations } = await import('@/components/common/settings/integrations');

beforeEach(() => {
   vi.clearAllMocks();
});

const mount = () =>
   render(
      <SidebarProvider>
         <Integrations />
      </SidebarProvider>
   );

/** Ad#35 — a seção "Enabled" e o selo "Enabled" eram fixos no código, não o estado real. */
describe('Integrations mostra o estado real (Ad#35)', () => {
   it('"Enabled" lista só o que está conectado de verdade', async () => {
      apiMocks.status.mockResolvedValue({
         github: true,
         slack: false,
         sentry: false,
         email: false,
      });
      mount();
      const heading = await screen.findByRole('heading', { name: 'Enabled' });
      const section = heading.closest('section') as HTMLElement;
      expect(within(section).getByText('GitHub')).toBeTruthy();
      expect(within(section).queryByText('Figma')).toBeNull();
      expect(within(section).queryByText('Slack')).toBeNull();
   });

   it('nada conectado: sem seção "Enabled" e sem selo "Enabled" nos cartões', async () => {
      apiMocks.status.mockResolvedValue({
         github: false,
         slack: false,
         sentry: false,
         email: false,
      });
      mount();
      await screen.findAllByText('Figma');
      expect(screen.queryByRole('heading', { name: 'Enabled' })).toBeNull();
      expect(screen.queryAllByText('Enabled')).toHaveLength(0);
   });
});
