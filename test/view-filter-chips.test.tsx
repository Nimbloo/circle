// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewFilterChips } from '@/components/common/views/view-filter-chips';
import type { View } from '@/data/views';

/**
 * A página de view salva mostra o filtro como chips SOMENTE LEITURA — os mesmos da
 * barra de filtro das listas, mas sem botão de remover nem popovers de edição.
 * Os catálogos (status/priority/label) vêm dos defaults mock do catalog-store.
 */

const view = (filter: View['filter'], type: View['type'] = 'issue'): View =>
   ({
      id: 'v1',
      name: 'Bugs em andamento',
      description: '',
      icon: '🐛',
      type,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      filter,
   }) as View;

describe('ViewFilterChips', () => {
   it('renderiza um chip por campo do ViewFilter, sem botão de remover', () => {
      render(
         <ViewFilterChips
            view={view({
               statusIds: ['in-progress', 'to-do'],
               priorityIds: ['high'],
               labelIds: ['bug'],
               unassigned: true,
            })}
         />
      );

      const bar = screen.getByRole('group', { name: 'View filters' });
      expect(bar).toBeTruthy();

      // Assunto / operador / valor de cada chip.
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('2 statuses')).toBeTruthy();
      expect(screen.getByText('Priority')).toBeTruthy();
      expect(screen.getByText('High')).toBeTruthy();
      expect(screen.getByText('Labels')).toBeTruthy();
      expect(screen.getByText('Bug')).toBeTruthy();
      expect(screen.getByText('Assignee')).toBeTruthy();
      expect(screen.getByText('Unassigned')).toBeTruthy();
      expect(screen.getAllByText('is').length).toBe(2);
      expect(screen.getByText('is any of')).toBeTruthy();
      expect(screen.getByText('includes')).toBeTruthy();

      // Somente leitura: nada clicável (sem X de remover, sem popover de operador/valor).
      expect(screen.queryAllByRole('button')).toHaveLength(0);
   });

   it('não renderiza a barra quando a view não tem filtro', () => {
      render(<ViewFilterChips view={view({})} />);
      expect(screen.queryByRole('group', { name: 'View filters' })).toBeNull();
   });

   it('view de projeto usa as colunas de projeto e ignora filtros só de issue', () => {
      render(
         <ViewFilterChips
            view={view(
               {
                  statusIds: ['in-progress'],
                  statusCategories: ['planned', 'started'],
                  priorityIds: ['high', 'urgent'],
                  labelIds: ['bug'],
                  // Não se aplicam a projeto: não viram chip.
                  unassigned: true,
                  hasProject: true,
               },
               'project'
            )}
         />
      );

      expect(screen.getByRole('group', { name: 'View filters' })).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Status type')).toBeTruthy();
      expect(screen.getByText('2 status types')).toBeTruthy();
      expect(screen.getByText('Priority')).toBeTruthy();
      expect(screen.getByText('2 priorities')).toBeTruthy();
      expect(screen.getByText('Labels')).toBeTruthy();
      expect(screen.getByText('Bug')).toBeTruthy();
      expect(screen.queryByText('Assignee')).toBeNull();
      expect(screen.queryByText('Project')).toBeNull();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
   });
});
