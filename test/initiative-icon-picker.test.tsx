// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeIconPicker } from '@/components/common/initiatives/initiative-icon-picker';

describe('InitiativeIconPicker', () => {
   it('replica abas acessíveis e busca independente de emojis do Linear', async () => {
      const user = userEvent.setup();
      render(
         <InitiativeIconPicker
            icon="target"
            color="violet"
            onIconChange={vi.fn()}
            onColorChange={vi.fn()}
         />
      );

      await user.click(screen.getByRole('button', { name: 'Choose icon' }));

      const iconsTab = screen.getByRole('tab', { name: 'Icons' });
      const emojisTab = screen.getByRole('tab', { name: 'Emojis' });
      expect(iconsTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.getByLabelText('Icon colors')).toBeTruthy();

      await user.click(emojisTab);

      expect(emojisTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.queryByLabelText('Icon colors')).toBeNull();
      await user.keyboard('{ArrowLeft}');
      expect(iconsTab.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(iconsTab);

      await user.click(emojisTab);
      const search = screen.getByRole('textbox', { name: 'Search emoji' });
      await user.type(search, 'rocket');
      expect(screen.getByRole('button', { name: 'Rocket' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Target' })).toBeNull();
   });
});
