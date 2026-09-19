// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { IssuePicker } from '@/components/common/issues/details/issue-picker';
import { RelationEditor } from '@/components/common/issues/details/relation-editor';

/**
 * is#9: os pickers de relação/issue renderizavam as ~3.000 issues do store (long task de
 * 443 ms, dezenas ao digitar); a relação não mostrava o identifier.
 */

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), addRelation: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { issues: { list: apiMocks.list, addRelation: apiMocks.addRelation } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const make = (n: number): Issue => ({
   id: `i${n}`,
   identifier: `ENG-${n}`,
   title: `Issue número ${n}`,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: String(n),
   teamId: 'ENG',
});

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   apiMocks.list.mockResolvedValue([]);
   useIssuesStore.setState({ issues: Array.from({ length: 3000 }, (_, n) => make(n + 1)) });
});

describe('picker de issue limitado (is#9)', () => {
   it('sem busca mostra só um punhado de candidatos', () => {
      render(<IssuePicker excludeIds={new Set()} onSelect={vi.fn()} />);
      expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(50);
   });

   it('a busca acha a issue certa mesmo fora do punhado inicial', async () => {
      const user = userEvent.setup();
      render(<IssuePicker excludeIds={new Set()} onSelect={vi.fn()} />);
      await user.type(screen.getByRole('combobox'), 'ENG-2999');
      await waitFor(() => {
         const options = screen.getAllByRole('option');
         expect(options.length).toBeLessThanOrEqual(50);
         expect(options.some((o) => o.textContent?.includes('ENG-2999'))).toBe(true);
      });
   });

   it('a busca ignora acentos no título', async () => {
      const user = userEvent.setup();
      render(<IssuePicker excludeIds={new Set()} onSelect={vi.fn()} />);
      await user.type(screen.getByRole('combobox'), 'numero 2998');
      await waitFor(() =>
         expect(screen.getAllByRole('option').some((o) => o.textContent?.includes('ENG-2998'))).toBe(
            true
         )
      );
   });

   it('o editor de relação usa o picker limitado e mostra o identifier das relacionadas', async () => {
      const user = userEvent.setup();
      render(
         <RelationEditor
            issueId="i1"
            kind="related"
            relatedIds={['i2']}
            addLabel="Add related"
            onChanged={vi.fn()}
         />
      );
      expect(screen.getByText('ENG-2')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: /Add related/ }));
      const listbox = await screen.findByRole('listbox');
      expect(within(listbox).getAllByRole('option').length).toBeLessThanOrEqual(50);
   });
});
