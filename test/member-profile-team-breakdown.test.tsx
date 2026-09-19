import { describe, expect, it } from 'vitest';
import { teamBreakdownCounts } from '@/components/common/members/member-profile';
import type { Issue } from '@/data/issues';

/** Ad#38 — o breakdown "Teams" repetia o total de issues em todas as linhas. */
describe('breakdown por time do perfil (Ad#38)', () => {
   it('conta as issues de cada time, não o total', () => {
      const issues = [
         { id: '1', teamId: 'CORE' },
         { id: '2', teamId: 'CORE' },
         { id: '3', teamId: 'OPS' },
      ] as unknown as Issue[];
      const teams = [
         { id: 'CORE', name: 'Core', icon: '🛠️' },
         { id: 'OPS', name: 'Ops', icon: '⚙️' },
         { id: 'DESIGN', name: 'Design', icon: '🎨' },
      ];
      expect(teamBreakdownCounts(issues, teams)).toEqual([
         { id: 'CORE', name: 'Core', icon: '🛠️', count: 2 },
         { id: 'OPS', name: 'Ops', icon: '⚙️', count: 1 },
      ]);
   });
});
