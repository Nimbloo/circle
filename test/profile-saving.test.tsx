// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const apiMocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { me: { update: apiMocks.update } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: Profile } = await import('@/components/common/settings/profile');

const me = {
   id: 'u1',
   slug: 'ana',
   name: 'Ana',
   email: 'ana@nimbloo.ai',
   avatarUrl: null,
   role: 'Member',
   admin: false,
   teamIds: [],
   subscribedIssueIds: [],
   githubLogin: null,
};

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({ me: me as never });
});

/** Ad#33 — um único `saving` desabilitava os dois inputs e o foco se perdia no Tab. */
describe('Profile (Ad#33)', () => {
   it('salvar o nome não desabilita o GitHub nem tira o foco dele', async () => {
      apiMocks.update.mockReturnValue(new Promise(() => {})); // gravação em voo
      const user = userEvent.setup();
      render(
         <SidebarProvider>
            <Profile />
         </SidebarProvider>
      );
      const name = screen.getByDisplayValue('Ana');
      await user.clear(name);
      await user.type(name, 'Ana Maria');
      await user.tab();

      expect(apiMocks.update).toHaveBeenCalledWith({ name: 'Ana Maria' });
      const gh = screen.getByPlaceholderText('seu-usuario') as HTMLInputElement;
      expect(gh.disabled).toBe(false);
      expect(document.activeElement).toBe(gh);
   });
});
