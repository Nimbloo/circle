// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCommandPages } from '@/components/ui/use-command-pages';
import {
   Command,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { describe, expect, it } from 'vitest';

type Page = 'root' | 'priority';

function CommandPagesHarness() {
   const [open, setOpen] = React.useState(true);
   const navigation = useCommandPages<Page>('root', () => setOpen(false));

   if (!open) return <span>Filter closed</span>;

   return (
      <div onKeyDown={navigation.onKeyDown}>
         {navigation.page === 'root' ? (
            <>
               <input
                  aria-label="Root filter"
                  ref={navigation.searchInputRef}
                  value={navigation.query}
                  onChange={(event) => navigation.setQuery(event.target.value)}
               />
               <button type="button" onClick={() => navigation.push('priority')}>
                  Priority
               </button>
            </>
         ) : (
            <input
               aria-label="Priority filter"
               ref={navigation.searchInputRef}
               value={navigation.query}
               onChange={(event) => navigation.setQuery(event.target.value)}
            />
         )}
      </div>
   );
}

function CommandArrowHarness() {
   const navigation = useCommandPages<Page>('root');

   return (
      <Command onKeyDown={navigation.onKeyDown}>
         {navigation.page === 'root' ? (
            <>
               <CommandInput ref={navigation.searchInputRef} aria-label="Root command filter" />
               <CommandList>
                  <CommandGroup>
                     <CommandItem
                        data-command-page="priority"
                        onSelect={() => navigation.push('priority')}
                     >
                        Priority
                     </CommandItem>
                  </CommandGroup>
               </CommandList>
            </>
         ) : (
            <CommandInput ref={navigation.searchInputRef} aria-label="Priority command filter" />
         )}
      </Command>
   );
}

describe('useCommandPages', () => {
   it('navega para a subpágina e restaura foco ao voltar com Escape', async () => {
      const user = userEvent.setup();
      render(<CommandPagesHarness />);

      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Root filter' }));

      await user.click(screen.getByRole('button', { name: 'Priority' }));
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Priority filter' }));

      await user.keyboard('{Escape}');
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Root filter' }));
   });

   it('volta uma camada com ArrowLeft sem fechar a raiz', async () => {
      const user = userEvent.setup();
      render(<CommandPagesHarness />);

      await user.click(screen.getByRole('button', { name: 'Priority' }));
      await user.keyboard('{ArrowLeft}');

      expect(screen.getByRole('textbox', { name: 'Root filter' })).toBeTruthy();
   });

   it('limpa a busca ao avançar e voltar entre páginas', async () => {
      const user = userEvent.setup();
      render(<CommandPagesHarness />);

      const rootInput = screen.getByRole('textbox', { name: 'Root filter' });
      await user.type(rootInput, 'priority');
      await user.click(screen.getByRole('button', { name: 'Priority' }));
      expect(screen.getByRole('textbox', { name: 'Priority filter' })).toHaveProperty('value', '');

      await user.type(screen.getByRole('textbox', { name: 'Priority filter' }), 'urgent');
      await user.keyboard('{Escape}');
      expect(screen.getByRole('textbox', { name: 'Root filter' })).toHaveProperty('value', '');
   });

   it('fecha o filtro com Escape apenas quando está na raiz', async () => {
      const user = userEvent.setup();
      render(<CommandPagesHarness />);

      await user.keyboard('{Escape}');

      expect(screen.getByText('Filter closed')).toBeTruthy();
   });

   it('avança com ArrowRight a partir do item ativo do cmdk', async () => {
      const user = userEvent.setup();
      render(<CommandArrowHarness />);

      expect(document.activeElement).toBe(screen.getByRole('combobox'));
      await user.keyboard('{ArrowRight}');

      expect(screen.getByLabelText('Priority command filter')).toBeTruthy();
   });
});
