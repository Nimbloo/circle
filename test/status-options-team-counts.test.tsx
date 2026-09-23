// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { StatusOptions } from '@/components/common/issues/property-options';

/**
 * O seletor de status contava issues de TODOS os times, não só o da issue/modal/rota
 * atual — em workspaces com vários times o número ficava sem sentido para quem via o
 * seletor de um time específico.
 */

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

const todo = status.find((s) => s.id === 'to-do')!;

const make = (id: string, teamId: string): Issue => ({
   id,
   identifier: `${teamId}-${id}`,
   title: id,
   description: '',
   status: todo,
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId,
});

beforeEach(() => {
   seedCatalog();
   useIssuesStore.setState({
      issues: [make('1', 'ENG'), make('2', 'ENG'), make('3', 'DESIGN')],
   });
});

describe('StatusOptions — contagem escopada por time', () => {
   it('sem teamId conta issues de todos os times', () => {
      render(<StatusOptions value={undefined} onSelect={vi.fn()} />);
      const option = screen.getByRole('option', { name: /Todo/ });
      expect(option.textContent).toContain('3');
   });

   it('com teamId conta só as issues daquele time', () => {
      render(<StatusOptions value={undefined} teamId="ENG" onSelect={vi.fn()} />);
      const option = screen.getByRole('option', { name: /Todo/ });
      expect(option.textContent).toContain('2');
   });

   it('time sem nenhuma issue no status mostra zero (não o total)', () => {
      render(<StatusOptions value={undefined} teamId="DESIGN" onSelect={vi.fn()} />);
      const option = screen.getByRole('option', { name: /Todo/ });
      expect(option.textContent).toContain('1');
   });
});
