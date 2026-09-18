// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/components/common/empty-state';

describe('EmptyState', () => {
   it('renderiza título, descrição e ação num status', () => {
      render(
         <EmptyState
            title="No teams yet"
            description="Create one."
            action={<button type="button">New team</button>}
         />
      );
      const status = screen.getByRole('status');
      expect(screen.getByText('No teams yet').tagName).toBe('H3');
      expect(status.textContent).toContain('Create one.');
      expect(screen.getByRole('button', { name: 'New team' })).toBeTruthy();
   });

   it('sem descrição/ação não gera markup extra', () => {
      const { container } = render(<EmptyState title="Nada" />);
      expect(container.querySelectorAll('p').length).toBe(0);
      // wrapper + chip do ícone + svg (+ filhos do svg) + título
      expect(container.querySelectorAll(':scope > div > *').length).toBe(2);
   });

   it.each([
      ['empty', 'lucide-circle-dashed'],
      ['activity', 'lucide-activity'],
      ['search', 'lucide-search'],
      ['filtered', 'lucide-list-filter'],
   ] as const)('variante %s usa o ícone padrão', (variant, cls) => {
      const { container } = render(<EmptyState variant={variant} title="x" />);
      expect(screen.getByRole('status').dataset.variant).toBe(variant);
      expect(container.querySelector('svg')?.getAttribute('class')).toContain(cls);
   });

   it('icon sobrescreve o ícone da variante', () => {
      const { container } = render(<EmptyState variant="filtered" icon={Users} title="x" />);
      expect(container.querySelector('svg')?.getAttribute('class')).toContain('lucide-users');
   });
});
