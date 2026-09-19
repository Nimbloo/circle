// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCatalog } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { StatusOptions } from '@/components/common/issues/property-options';

/**
 * is#19: o seletor de status listava os status na ordem crua do catálogo (a da API),
 * não na ordem de workflow (triage → backlog → unstarted → started → completed →
 * canceled) — mistura categorias e confunde.
 */

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

beforeEach(() => {
   seedCatalog();
   useIssuesStore.setState({ issues: [] });
});

describe('StatusOptions — ordem de workflow (is#19)', () => {
   it('agrupa por categoria na ordem triage → backlog → unstarted → started → completed → canceled', () => {
      render(<StatusOptions value={undefined} onSelect={vi.fn()} />);
      const names = screen.getAllByRole('option').map((o) => o.textContent);
      const indexOf = (label: string) => names.findIndex((n) => n?.includes(label));

      expect(indexOf('Triage')).toBeLessThan(indexOf('Backlog'));
      expect(indexOf('Backlog')).toBeLessThan(indexOf('Todo'));
      expect(indexOf('Todo')).toBeLessThan(indexOf('In Progress'));
      expect(indexOf('In Progress')).toBeLessThan(indexOf('Done'));
      expect(indexOf('Done')).toBeLessThan(indexOf('Canceled'));
   });
});
