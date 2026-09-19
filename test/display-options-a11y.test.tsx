// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayOptions } from '@/components/layout/headers/display-options';
import { useDisplaySettingsStore } from '@/store/display-settings-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));

describe('Me: botão Display acessível', () => {
   beforeEach(() => useDisplaySettingsStore.setState({ byView: {} }));

   it('tem aria-label e anuncia quando as opções foram alteradas', () => {
      render(<DisplayOptions />);
      expect(screen.getByRole('button', { name: 'Display options' })).toBeTruthy();

      act(() => useDisplaySettingsStore.getState().setGrouping('team/ENG/all', 'assignee'));
      expect(screen.getByRole('button', { name: 'Display options (modified)' })).toBeTruthy();
   });
});
