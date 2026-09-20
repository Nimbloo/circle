// @vitest-environment jsdom
process.env.TZ = 'America/Sao_Paulo';

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dueDateLabel, dueDateTone, parseDueDate } from '@/components/common/issues/due-date';
import { IssueLine } from '@/components/common/issues/issue-line';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { viewKeyFromPathname } from '@/lib/view-key';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

/**
 * is#7: a lista mostrava o prazo 1 dia antes em UTC−3 (`new Date('YYYY-MM-DD')` é meia-noite
 * UTC) e sempre em vermelho.
 */
describe('prazo da issue (is#7)', () => {
   const now = new Date(2026, 8, 19, 15, 0); // 19/set/2026 15h local

   it('YYYY-MM-DD é o dia local, sem voltar um dia no fuso negativo', () => {
      const d = parseDueDate('2026-09-25');
      expect(d.getDate()).toBe(25);
      expect(dueDateLabel('2026-09-25', now)).toBe('Sep 25');
   });

   it('mostra o ano só fora do ano corrente', () => {
      expect(dueDateLabel('2027-01-05', now)).toBe('Jan 5, 2027');
   });

   it('cor só quando vencida ou perto', () => {
      expect(dueDateTone('2026-09-18', now)).toBe('overdue');
      expect(dueDateTone('2026-09-19', now)).toBe('soon');
      expect(dueDateTone('2026-09-24', now)).toBe('soon');
      expect(dueDateTone('2026-10-10', now)).toBe('normal');
   });
});

describe('prazo na linha da issue (is#7)', () => {
   it('mostra o dia certo no fuso −3 e sem vermelho quando longe', () => {
      seedCatalog();
      useDisplaySettingsStore
         .getState()
         .toggleDisplayProperty(viewKeyFromPathname('/nimbloo/team/ENG/all'), 'dueDate');
      const far = new Date();
      far.setDate(far.getDate() + 40);
      const iso = `${far.getFullYear()}-${String(far.getMonth() + 1).padStart(2, '0')}-${String(
         far.getDate()
      ).padStart(2, '0')}`;
      const issue: Issue = {
         id: 'a',
         identifier: 'ENG-1',
         title: 'x',
         description: '',
         status: status[0],
         priority: priorities[0],
         assignee: null,
         assignees: [],
         labels: [],
         createdAt: '2026-01-01T00:00:00.000Z',
         cycleId: '',
         rank: 'a',
         teamId: 'ENG',
         dueDate: iso,
      };
      render(<IssueLine issue={issue} />);
      const btn = screen.getByRole('button', { name: 'Change due date' });
      expect(btn.textContent).toContain(String(far.getDate()));
      expect(btn.className).not.toMatch(/text-destructive/);
   });
});
