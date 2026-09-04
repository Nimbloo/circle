// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueLine } from '@/components/common/issues/issue-line';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import type { FiltersState } from '@/components/data-table-filter/core/types';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));

const todo = status.find((s) => s.id === 'to-do')!;
const done = status.find((s) => s.category === 'completed')!;

const makeIssue = (over: Partial<Issue> & { id: string }): Issue => ({
   identifier: `ENG-${over.id}`,
   title: `Issue ${over.id}`,
   description: '',
   status: todo,
   priority: priorities.find((p) => p.id === 'urgent')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: over.id,
   teamId: 'ENG',
   ...over,
});

/** Prazo vencido/próximo relativos a agora — o indicador é calculado no render. */
const day = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ymd = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().slice(0, 10);

const BREACHED = makeIssue({
   id: 'b',
   dueDate: ymd(-2 * day),
   slaAppliedAt: iso(-5 * day),
});
const AT_RISK = makeIssue({
   id: 'r',
   // Janela de 10 dias com só ~1 dia restante → menos de 25%.
   dueDate: ymd(0),
   slaAppliedAt: iso(-10 * day),
});
const OK = makeIssue({ id: 'o', dueDate: ymd(30 * day), slaAppliedAt: iso(-1 * day) });
const NO_SLA = makeIssue({ id: 'n', dueDate: ymd(-2 * day), slaAppliedAt: null });

describe('IssueLine — indicador de SLA (#97)', () => {
   beforeEach(() => {
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
      useIssuesStore.setState({ issues: [] });
   });

   it('mostra "SLA breached" no prazo vencido e "SLA at risk" perto do fim', () => {
      render(<IssueLine issue={BREACHED} />);
      expect(screen.getByLabelText('SLA breached')).toBeTruthy();

      render(<IssueLine issue={AT_RISK} />);
      expect(screen.getByLabelText('SLA at risk')).toBeTruthy();
   });

   it('não mostra nada sem SLA aplicado, com folga no prazo, ou já concluída', () => {
      const { unmount } = render(<IssueLine issue={NO_SLA} />);
      expect(screen.queryByLabelText(/^SLA/)).toBeNull();
      unmount();

      const ok = render(<IssueLine issue={OK} />);
      expect(screen.queryByLabelText(/^SLA/)).toBeNull();
      ok.unmount();

      render(<IssueLine issue={{ ...BREACHED, status: done }} />);
      expect(screen.queryByLabelText(/^SLA/)).toBeNull();
   });
});

describe('filtro "SLA"', () => {
   const all = [BREACHED, AT_RISK, OK, NO_SLA];
   const filter = (values: string[]): FiltersState =>
      [{ columnId: 'sla', type: 'option', operator: 'is any of', values }] as FiltersState;

   it('separa breached, at-risk, on track e sem SLA', () => {
      expect(applyIssueFilters(all, filter(['breached'])).map((i) => i.id)).toEqual(['b']);
      expect(applyIssueFilters(all, filter(['at-risk'])).map((i) => i.id)).toEqual(['r']);
      expect(applyIssueFilters(all, filter(['ok'])).map((i) => i.id)).toEqual(['o']);
      expect(applyIssueFilters(all, filter(['none'])).map((i) => i.id)).toEqual(['n']);
      expect(applyIssueFilters(all, filter(['at-risk', 'breached'])).map((i) => i.id)).toEqual([
         'b',
         'r',
      ]);
   });
});
