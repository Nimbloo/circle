// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   DetailPanelContainer,
   DetailPanelToggle,
   DetailSidePanel,
   DetailSidePanelTrigger,
   SidePanelSlot,
} from '@/components/common/detail-side-panel';
import { MOTION_MS } from '@/lib/motion';
import { DEFAULT_DETAIL_PANELS, useDetailPanelStore } from '@/store/detail-panel-store';

describe('DetailSidePanel', () => {
   beforeEach(() => {
      useDetailPanelStore.setState({ openByKind: { ...DEFAULT_DETAIL_PANELS } });
   });

   it('o aside fica montado e anima a largura; fechado sai da árvore acessível', () => {
      function Counter() {
         const [n, setN] = React.useState(0);
         return (
            <button type="button" onClick={() => setN((v) => v + 1)}>
               Project properties {n}
            </button>
         );
      }
      render(
         <DetailSidePanel kind="project" title="Project details">
            <Counter />
         </DetailSidePanel>
      );

      const aside = screen.getByRole('complementary', { name: 'Project details' });
      expect(aside.className).toContain('motion-panel');
      expect(aside.getAttribute('data-state')).toBe('open');
      expect(aside.className).toContain('w-[400px]');
      // Conteúdo com largura fixa: não reflui enquanto a largura do aside anima.
      const inner = within(aside).getByText(/Project properties/).parentElement!;
      expect(inner.className).toContain('w-[400px]');
      act(() => within(aside).getByRole('button').click());
      expect(within(aside).getByText('Project properties 1')).toBeTruthy();

      act(() => useDetailPanelStore.getState().setOpen('project', false));
      expect(screen.queryByRole('complementary', { name: 'Project details' })).toBeNull();
      expect(aside.isConnected).toBe(true);
      expect(aside.getAttribute('data-state')).toBe('closed');
      expect(aside.getAttribute('aria-hidden')).toBe('true');
      expect(aside.hasAttribute('inert')).toBe(true);
      expect(aside.className).toContain('w-0');
      expect(aside.className).not.toContain('w-[400px]');
      expect(inner.className).toContain('w-[400px]');

      // Reabrir não remonta: o estado do conteúdo sobrevive (sem refetch nem pulo).
      act(() => useDetailPanelStore.getState().setOpen('project', true));
      expect(screen.getByRole('complementary', { name: 'Project details' })).toBe(aside);
      expect(within(aside).getByText('Project properties 1')).toBeTruthy();
   });

   it('dentro do DetailPanelContainer a largura segue os degraus do container', () => {
      render(
         <DetailPanelContainer>
            <DetailSidePanel kind="issue" title="Issue details">
               <p>Issue properties</p>
            </DetailSidePanel>
         </DetailPanelContainer>
      );
      const aside = screen.getByRole('complementary', { name: 'Issue details' });
      expect(aside.className).toContain('@7xl:w-[400px]');
      const inner = within(aside).getByText('Issue properties').parentElement!;
      expect(inner.className).toContain('@5xl:w-80');

      act(() => useDetailPanelStore.getState().setOpen('issue', false));
      expect(aside.className).toContain('w-0');
      expect(aside.className).not.toContain('@7xl:w-[400px]');
      expect(inner.className).toContain('@7xl:w-[400px]');
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

describe('SidePanelSlot (insights e painéis de lista)', () => {
   afterEach(() => vi.useRealTimers());

   function Host({ open }: { open: boolean }) {
      return (
         <SidePanelSlot open={open} width={420} label="Insights" panelClassName="border-l">
            <p>Insights body</p>
         </SidePanelSlot>
      );
   }

   it('abre animando a largura com conteúdo de largura fixa e só monta o conteúdo aberto', () => {
      vi.useFakeTimers();
      const { rerender } = render(<Host open={false} />);
      const slot = document.querySelector<HTMLElement>('[data-slot="side-panel-slot"]')!;
      expect(slot.className).toContain('motion-panel');
      expect(slot.style.width).toBe('0px');
      expect(screen.queryByText('Insights body')).toBeNull();

      rerender(<Host open />);
      expect(slot.style.width).toBe('420px');
      expect(slot.getAttribute('data-state')).toBe('open');
      const inner = screen.getByText('Insights body').parentElement!;
      expect(inner.style.width).toBe('420px');
      expect(inner.className).toContain('border-l');
      expect(screen.getByRole('complementary', { name: 'Insights' })).toBe(slot);

      // Fechando: a largura vai a 0 e o conteúdo fica até o fim da transição.
      rerender(<Host open={false} />);
      expect(slot.style.width).toBe('0px');
      expect(slot.getAttribute('aria-hidden')).toBe('true');
      expect(screen.getByText('Insights body')).toBeTruthy();
      act(() => vi.advanceTimersByTime(MOTION_MS.modal + 20));
      expect(screen.queryByText('Insights body')).toBeNull();
   });

   it('reabrir durante a saída mantém o conteúdo montado', () => {
      vi.useFakeTimers();
      const { rerender } = render(<Host open />);
      rerender(<Host open={false} />);
      act(() => vi.advanceTimersByTime(MOTION_MS.modal / 2));
      rerender(<Host open />);
      act(() => vi.advanceTimersByTime(MOTION_MS.modal * 2));
      expect(screen.getByText('Insights body')).toBeTruthy();
   });
});
