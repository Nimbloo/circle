// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayOptions } from '@/components/layout/headers/display-options';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useViewTypeStore } from '@/store/view-store';

/**
 * is#24: "Reset" zerava grouping/ordering/etc mas deixava o layout board ligado —
 * o botão continuava "modified" mesmo depois do reset.
 */

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));

for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

describe('Display › Reset (is#24)', () => {
   beforeEach(() => {
      useDisplaySettingsStore.setState({ byView: {} });
      useViewTypeStore.setState({ viewTypeByView: {} });
   });

   it('volta o layout para lista, junto com grouping/ordering', async () => {
      const user = userEvent.setup();
      act(() => {
         useDisplaySettingsStore.getState().setGrouping('team/ENG/all', 'assignee');
         useViewTypeStore.getState().setViewType('team/ENG/all', 'grid');
      });

      render(<DisplayOptions />);
      expect(screen.getByRole('button', { name: 'Display options (modified)' })).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Display options (modified)' }));
      await user.click(await screen.findByText('Reset'));

      expect(useViewTypeStore.getState().viewTypeByView['team/ENG/all']).toBe('list');
      expect(screen.getByRole('button', { name: 'Display options' })).toBeTruthy();
   });
});
