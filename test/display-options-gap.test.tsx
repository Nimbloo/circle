// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayOptions } from '@/components/layout/headers/display-options';
import { useDisplaySettingsStore } from '@/store/display-settings-store';

/**
 * is#25: o popover de Display tinha vão morto — a seção "Completed issues" (uma
 * linha só) tinha altura fixa de 81px, e o popover inteiro forçava min-h de 541px
 * mesmo quando o conteúdo era mais baixo.
 */

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));

describe('popover de Display sem vão morto (is#25)', () => {
   beforeEach(() => useDisplaySettingsStore.setState({ byView: {} }));

   it('nem o popover nem a seção "Completed issues" têm altura fixa', async () => {
      const user = userEvent.setup();
      render(<DisplayOptions />);
      await user.click(screen.getByRole('button', { name: 'Display options' }));

      const completedLabel = await screen.findByText('Completed issues');
      const section = completedLabel.closest('div.border-t') as HTMLElement;
      expect(section.className).not.toMatch(/h-\[81px\]/);

      const popover = document.querySelector('[data-slot="popover-content"]') as HTMLElement;
      expect(popover).toBeTruthy();
      expect(popover.className).not.toMatch(/min-h-\[541px\]/);
   });
});
