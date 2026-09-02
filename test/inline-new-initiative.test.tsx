// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   buildInitiativeSlug,
   InlineNewInitiative,
} from '@/components/common/initiatives/inline-new-initiative';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({
   create: vi.fn(),
   priorities: vi.fn(),
   healthStates: vi.fn(),
}));

vi.mock('@/lib/client', () => ({
   api: {
      initiatives: { create: apiMocks.create },
      priorities: apiMocks.priorities,
      healthStates: apiMocks.healthStates,
   },
}));

vi.mock('sonner', () => ({
   toast: { success: vi.fn(), error: vi.fn() },
}));

describe('InlineNewInitiative', () => {
   beforeEach(() => {
      apiMocks.priorities.mockResolvedValue([{ id: 'no-priority' }]);
      apiMocks.healthStates.mockResolvedValue([{ id: 'no-update' }]);
      useInlineInitiativeStore.setState({ creating: true });
      useWorkspaceStore.setState({ users: [], hydrate: vi.fn().mockResolvedValue(undefined) });
   });

   afterEach(() => {
      vi.clearAllMocks();
   });

   it('reproduz a ordem de foco do Linear e mantém Create desabilitado sem nome', async () => {
      const user = userEvent.setup();
      render(<InlineNewInitiative defaultStatus="active" />);

      const name = screen.getByRole('textbox', { name: 'Initiative name' });
      expect(document.activeElement).toBe(name);
      expect(screen.getByRole('button', { name: 'Create initiative' })).toHaveProperty(
         'disabled',
         true
      );

      const expectedOrder = [
         screen.getByRole('textbox', { name: 'Initiative summary' }),
         screen.getByRole('button', { name: 'Change status' }),
         screen.getByRole('button', { name: 'Change priority' }),
         screen.getByRole('button', { name: 'Change initiative owner' }),
         screen.getByRole('button', { name: 'Change initiative target date' }),
         screen.getByRole('button', { name: 'Change labels' }),
         screen.getByRole('button', { name: 'Cancel initiative' }),
      ];

      for (const target of expectedOrder) {
         await user.tab();
         expect(document.activeElement).toBe(target);
      }
   });

   it('cancela o draft com Escape no editor principal', async () => {
      const user = userEvent.setup();
      render(<InlineNewInitiative defaultStatus="active" />);

      await waitFor(() =>
         expect(document.activeElement).toBe(
            screen.getByRole('textbox', { name: 'Initiative name' })
         )
      );
      await user.keyboard('{Escape}');

      expect(useInlineInitiativeStore.getState().creating).toBe(false);
   });

   it('aplica os atalhos numéricos exibidos no menu de status', async () => {
      const user = userEvent.setup();
      render(<InlineNewInitiative defaultStatus="active" />);

      const status = screen.getByRole('button', { name: 'Change status' });
      await user.click(status);
      await user.keyboard('1');

      expect(status.textContent).toContain('Proposed');
   });

   it('fecha primeiro o seletor com Escape sem perder o draft', async () => {
      const user = userEvent.setup();
      render(<InlineNewInitiative defaultStatus="active" />);

      const name = screen.getByRole('textbox', { name: 'Initiative name' });
      await user.type(name, 'Draft preservado');
      await user.click(screen.getByRole('button', { name: 'Change status' }));
      await user.keyboard('{Escape}');

      expect(useInlineInitiativeStore.getState().creating).toBe(true);
      expect(name).toHaveProperty('value', 'Draft preservado');
   });

   it('gera slugs válidos e sem colisão para nomes repetidos ou sem caracteres ASCII', () => {
      const first = buildInitiativeSlug('Expansão internacional');
      const second = buildInitiativeSlug('Expansão internacional');
      const unicodeOnly = buildInitiativeSlug('日本語');

      expect(first).toMatch(/^expansao-internacional-[a-f0-9]{12}$/);
      expect(second).not.toBe(first);
      expect(unicodeOnly).toMatch(/^initiative-[a-f0-9]{12}$/);
      expect(first.length).toBeLessThanOrEqual(96);
   });
});
