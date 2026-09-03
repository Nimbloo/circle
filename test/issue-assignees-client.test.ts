import { describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import type { User } from '@/data/users';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { scopeMyIssues } from '@/components/common/my-issues/use-my-issues';
import { useIssuesStore } from '@/store/issues-store';

vi.mock('@/lib/client', () => ({
   api: { issues: { update: vi.fn().mockResolvedValue({}) } },
}));

const user = (id: string, name: string) => ({ id, name }) as User;
const ana = user('u-ana', 'Ana');
const bob = user('u-bob', 'Bob');
const lia = user('u-lia', 'Lia');

/** Issue mínima: `assignee` = principal (= assignees[0]). */
function issue(id: string, assignees: User[]): Issue {
   return {
      id,
      identifier: id,
      title: id,
      status: { id: 'todo', category: 'unstarted' },
      priority: { id: 'none' },
      assignee: assignees[0] ?? null,
      assignees,
      labels: [],
      cycleId: '',
      createdAt: '2026-09-01T00:00:00Z',
      rank: id,
   } as unknown as Issue;
}

const principalOnly = issue('A', [bob]);
const collaborator = issue('B', [bob, ana]);
const nobody = issue('C', []);
const all = [principalOnly, collaborator, nobody];

describe('My issues › Assigned com colaborador (#96)', () => {
   it('inclui as issues em que sou colaboradora (não só principal)', () => {
      const out = scopeMyIssues(all, 'assigned', ana.id, new Set());
      expect(out.map((i) => i.id)).toEqual(['B']);
   });

   it('usa o conjunto do filtro servidor quando ele está disponível', () => {
      const out = scopeMyIssues(all, 'assigned', ana.id, new Set(), undefined, new Set(['A']));
      expect(out.map((i) => i.id)).toEqual(['A']);
   });
});

describe('filtro Assignee casa qualquer responsável', () => {
   it('"is Ana" traz onde ela é colaboradora', () => {
      const out = applyIssueFilters(all, [
         { columnId: 'assignee', type: 'option', operator: 'is', values: [ana.id] },
      ]);
      expect(out.map((i) => i.id)).toEqual(['B']);
   });

   it('"is not Bob" exclui toda issue em que Bob participa; mantém as sem responsável', () => {
      const out = applyIssueFilters(all, [
         { columnId: 'assignee', type: 'option', operator: 'is not', values: [bob.id] },
      ]);
      expect(out.map((i) => i.id)).toEqual(['C']);
   });

   it('"is Unassigned" continua funcionando', () => {
      const out = applyIssueFilters(all, [
         { columnId: 'assignee', type: 'option', operator: 'is', values: ['unassigned'] },
      ]);
      expect(out.map((i) => i.id)).toEqual(['C']);
   });
});

describe('issues-store — responsáveis', () => {
   it('updateIssueAssignee troca o principal e mantém colaboradores; envia o conjunto', async () => {
      const { api } = await import('@/lib/client');
      useIssuesStore.setState({ issues: [collaborator], issuesByStatus: {} });

      await useIssuesStore.getState().updateIssueAssignee('B', lia);
      const after = useIssuesStore.getState().getIssueById('B')!;
      expect(after.assignee?.id).toBe(lia.id);
      expect(after.assignees.map((a) => a.id)).toEqual([lia.id, ana.id]);
      expect(api.issues.update).toHaveBeenLastCalledWith('B', { assigneeIds: [lia.id, ana.id] });

      // Sem principal: o 1º colaborador é promovido (mesma regra do servidor).
      await useIssuesStore.getState().updateIssueAssignee('B', null);
      const promoted = useIssuesStore.getState().getIssueById('B')!;
      expect(promoted.assignee?.id).toBe(ana.id);
      expect(promoted.assignees.map((a) => a.id)).toEqual([ana.id]);
   });

   it('filterByAssignee / filterIssues casam colaborador', () => {
      useIssuesStore.setState({ issues: all, issuesByStatus: {} });
      const s = useIssuesStore.getState();
      expect(s.filterByAssignee(ana.id).map((i) => i.id)).toEqual(['B']);
      expect(s.filterIssues({ assignee: [ana.id, 'unassigned'] }).map((i) => i.id)).toEqual([
         'B',
         'C',
      ]);
   });
});
