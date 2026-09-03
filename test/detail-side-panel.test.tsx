// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
   DetailPanelToggle,
   DetailSidePanel,
   DetailSidePanelTrigger,
} from '@/components/common/detail-side-panel';
import { DEFAULT_DETAIL_PANELS, useDetailPanelStore } from '@/store/detail-panel-store';

describe('DetailSidePanel', () => {
   beforeEach(() => {
      useDetailPanelStore.setState({ openByKind: { ...DEFAULT_DETAIL_PANELS } });
   });

   it('renderiza o aside só enquanto o store diz que o painel está aberto', () => {
      render(
         <DetailSidePanel kind="project" title="Project details">
            <p>Project properties</p>
         </DetailSidePanel>
      );

      const aside = screen.getByRole('complementary', { name: 'Project details' });
      expect(within(aside).getByText('Project properties')).toBeTruthy();

      act(() => useDetailPanelStore.getState().setOpen('project', false));
      expect(screen.queryByRole('complementary', { name: 'Project details' })).toBeNull();
      expect(screen.queryByText('Project properties')).toBeNull();

      act(() => useDetailPanelStore.getState().setOpen('project', true));
      expect(screen.getByRole('complementary', { name: 'Project details' })).toBeTruthy();
   });

   it('o toggle alterna o aria-label e o aria-expanded sem perder o foco', async () => {
      const user = userEvent.setup();
      render(<DetailPanelToggle kind="issue" />);

      const toggle = screen.getByRole('button', { name: 'Close Issue details' });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.className).toContain('size-7');

      await user.click(toggle);
      expect(toggle.getAttribute('aria-label')).toBe('Open Issue details');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(useDetailPanelStore.getState().openByKind.issue).toBe(false);
      expect(document.activeElement).toBe(toggle);

      await user.click(toggle);
      expect(toggle.getAttribute('aria-label')).toBe('Close Issue details');
      expect(useDetailPanelStore.getState().openByKind.issue).toBe(true);
   });

   it('o trigger mobile abre o Sheet com o mesmo conteúdo, sem mexer no painel desktop', async () => {
      const user = userEvent.setup();
      useDetailPanelStore.getState().setOpen('initiative', false);
      render(
         <>
            <DetailSidePanelTrigger kind="initiative" />
            <DetailSidePanel
               kind="initiative"
               title="Initiative details"
               description="View and edit the properties of this initiative."
            >
               <p>Initiative properties</p>
            </DetailSidePanel>
         </>
      );

      expect(screen.queryByRole('dialog')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Properties' }));

      const sheet = screen.getByRole('dialog', { name: 'Initiative details' });
      expect(within(sheet).getByText('Initiative properties')).toBeTruthy();
      expect(
         within(sheet).getByText('View and edit the properties of this initiative.')
      ).toBeTruthy();
      expect(useDetailPanelStore.getState().openByKind.initiative).toBe(false);

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
   });
});
