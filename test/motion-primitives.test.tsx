// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { MOTION_MS } from '@/lib/motion';

const css = readFileSync('app/globals.css', 'utf8');
const rule = (selector: string) => {
   const at = css.indexOf(`${selector} {`);
   expect(at, `regra ${selector}`).toBeGreaterThan(-1);
   return css.slice(at, css.indexOf('}', at));
};

/**
 * Sistema de motion: os primitivos Radix usam as classes `.motion-*` (tokens de
 * `app/globals.css`) em vez do `tailwindcss-animate` (150 ms `ease` para tudo, escala a
 * partir do centro, sheet de 500 ms). As curvas e a percepção só se validam no navegador;
 * aqui fica o contrato: classe certa, pele do popover, overlay único e tokens.
 */
describe('motion dos primitivos', () => {
   afterEach(() => vi.useRealTimers());

   it('tokens de curva e duração existem com os valores do sistema', () => {
      const root = css.slice(css.indexOf(':root {'));
      expect(root).toContain('--ease-out: cubic-bezier(0.16, 1, 0.3, 1)');
      expect(root).toContain('--ease-in: cubic-bezier(0.4, 0, 1, 1)');
      expect(root).toContain('--ease-std: cubic-bezier(0.2, 0, 0, 1)');
      for (const [token, ms] of [
         ['--dur-instant', MOTION_MS.instant],
         ['--dur-fast', MOTION_MS.fast],
         ['--dur-base', MOTION_MS.base],
         ['--dur-modal', MOTION_MS.modal],
         ['--dur-sheet', MOTION_MS.sheet],
         ['--dur-sheet-exit', MOTION_MS.sheetExit],
         ['--dur-content', MOTION_MS.content],
      ] as const)
         expect(root).toContain(`${token}: ${ms}ms`);
      expect(root).toContain('--overlay: rgb(0 0 0 / 0.4)');
   });

   it('menus entram em 160 ms ease-out a partir do trigger e saem em 120 ms ease-in', () => {
      expect(rule('.motion-pop')).toContain('var(--radix-popper-transform-origin');
      expect(
         rule(
            ".motion-pop:is([data-state='open'], [data-state='delayed-open'], [data-state='instant-open'])"
         )
      ).toContain('var(--dur-base) var(--ease-out)');
      expect(rule(".motion-pop[data-state='closed']")).toContain('var(--dur-fast) var(--ease-in)');
      expect(rule(".motion-sheet[data-state='open']")).toContain('var(--dur-sheet)');
      expect(rule(".motion-sheet[data-state='closed']")).toContain('var(--dur-sheet-exit)');
      expect(rule(".motion-overlay-sheet[data-state='closed']")).toContain('var(--dur-sheet-exit)');
      expect(rule(".motion-modal[data-state='closed']")).toContain('var(--dur-fast)');
   });

   it('popover, dropdown e context menu usam a mesma pele e o mesmo item', () => {
      render(
         <>
            <Popover open>
               <PopoverTrigger>p</PopoverTrigger>
               <PopoverContent>Popover body</PopoverContent>
            </Popover>
            <DropdownMenu open>
               <DropdownMenuTrigger>d</DropdownMenuTrigger>
               <DropdownMenuContent>
                  <DropdownMenuItem>Dropdown item</DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            <ContextMenu>
               <ContextMenuTrigger>alvo</ContextMenuTrigger>
               <ContextMenuContent>
                  <ContextMenuItem>Context item</ContextMenuItem>
               </ContextMenuContent>
            </ContextMenu>
         </>
      );
      fireEvent.contextMenu(screen.getByText('alvo'));

      const popover = screen.getByText('Popover body');
      expect(popover.className).toContain('motion-pop');
      expect(popover.className).toContain('rounded-xl');

      // Menus modais escondem o resto da árvore (aria-hidden): busca pelo slot.
      const dropdown = document.querySelector('[data-slot="dropdown-menu-content"]')!;
      const context = document.querySelector('[data-slot="context-menu-content"]')!;
      for (const menu of [dropdown, context]) {
         expect(menu.className).toContain('motion-pop');
         expect(menu.className).toContain('rounded-lg');
         expect(menu.className).toContain('border-[var(--popover-border)]');
         expect(menu.className).toContain('shadow-[var(--popover-shadow)]');
         expect(menu.className).not.toContain('animate-in');
      }
      const item = (text: string) =>
         screen
            .getByText(text)
            .className.split(' ')
            .filter((c) => ['h-8', 'px-2.5', 'rounded-lg', 'text-[13px]'].includes(c))
            .sort();
      expect(item('Context item')).toEqual(item('Dropdown item'));
      expect(item('Context item')).toHaveLength(4);
   });

   it('tooltip espera 300 ms de hover e usa a pele do popover', () => {
      vi.useFakeTimers();
      render(
         <Tooltip>
            <TooltipTrigger>alvo</TooltipTrigger>
            <TooltipContent>Dica</TooltipContent>
         </Tooltip>
      );
      fireEvent.pointerMove(screen.getByText('alvo'), { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(250));
      expect(screen.queryByRole('tooltip')).toBeNull();
      act(() => vi.advanceTimersByTime(100));
      const content = screen.getAllByText('Dica')[0];
      expect(content.className).toContain('motion-pop');
      expect(content.className).toContain('bg-popover');
      expect(content.className).toContain('rounded-lg');
   });

   it('dialog, alert dialog e sheet: um único overlay e a classe de motion de cada um', () => {
      render(
         <>
            <Dialog open>
               <DialogContent>
                  <DialogTitle>Dialog</DialogTitle>
               </DialogContent>
            </Dialog>
            <AlertDialog open>
               <AlertDialogContent>
                  <AlertDialogTitle>Alert</AlertDialogTitle>
               </AlertDialogContent>
            </AlertDialog>
            <Sheet open>
               <SheetContent side="left">
                  <SheetTitle>Sheet</SheetTitle>
               </SheetContent>
            </Sheet>
         </>
      );
      const overlays = [
         ...document.querySelectorAll(
            '[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"], [data-slot="sheet-overlay"]'
         ),
      ];
      expect(overlays).toHaveLength(3);
      for (const overlay of overlays) {
         expect(overlay.className).toContain('bg-overlay');
         expect(overlay.className).not.toMatch(/bg-black/);
      }
      expect(document.querySelector('[data-slot="sheet-overlay"]')!.className).toContain(
         'motion-overlay-sheet'
      );

      for (const title of ['Dialog', 'Alert']) {
         const content = screen.getByText(title).closest('[role="dialog"], [role="alertdialog"]')!;
         expect(content.className).toContain('motion-modal');
         expect(content.className).not.toContain('duration-150');
      }
      const sheet = screen.getByText('Sheet').closest('[role="dialog"]')!;
      expect(sheet.className).toContain('motion-sheet');
      expect(sheet.getAttribute('data-side')).toBe('left');
      expect(sheet.className).not.toMatch(/duration-500/);
   });

   it('toast usa a pele do popover pelas variáveis do sonner', async () => {
      // next-themes e sonner leem o tema do sistema; o jsdom não tem matchMedia.
      window.matchMedia ??= ((query: string) => ({
         matches: false,
         media: query,
         onchange: null,
         addEventListener: () => {},
         removeEventListener: () => {},
         addListener: () => {},
         removeListener: () => {},
         dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
      render(<Toaster />);
      act(() => {
         toast('Salvo');
      });
      await screen.findByText('Salvo');
      const toaster = document.querySelector<HTMLElement>('[data-sonner-toaster]')!;
      expect(toaster.style.getPropertyValue('--normal-bg')).toBe('var(--popover)');
      expect(toaster.style.getPropertyValue('--normal-border')).toBe('var(--popover-border)');
      expect(toaster.style.getPropertyValue('--border-radius')).toBe('8px');
      expect(rule("[data-sonner-toaster] [data-sonner-toast][data-styled='true']")).toContain(
         'var(--popover-shadow)'
      );
      expect(rule("[data-sonner-toaster] [data-sonner-toast][data-removed='true']")).toContain(
         'var(--dur-content)'
      );
   });
});
