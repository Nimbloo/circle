import { describe, expect, it } from 'vitest';
import { bucketIssues } from '@/lib/issue-breakdown';

type Row = { id: string; labels: string[] };

describe('bucketIssues (breakdown de painéis)', () => {
   it('issue com várias labels entra no bucket de cada label', () => {
      const issues: Row[] = [
         { id: 'a', labels: ['bug', 'ui'] },
         { id: 'b', labels: ['ui'] },
         { id: 'c', labels: [] },
      ];

      const buckets = bucketIssues(issues, (issue) => issue.labels);

      expect([...buckets.keys()].sort()).toEqual(['bug', 'ui']);
      expect(buckets.get('ui')!.map((i) => i.id)).toEqual(['a', 'b']);
      expect(buckets.get('bug')!.map((i) => i.id)).toEqual(['a']);
   });

   it('chave única e undefined continuam valendo (assignee, ciclo)', () => {
      const issues = [
         { id: 'a', owner: 'x' as string | undefined },
         { id: 'b', owner: undefined },
      ];

      const buckets = bucketIssues(issues, (issue) => issue.owner);

      expect([...buckets.keys()]).toEqual(['x']);
   });

   it('label repetida na mesma issue não conta 2×', () => {
      const buckets = bucketIssues([{ id: 'a', labels: ['ui', 'ui'] }], (i) => i.labels);
      expect(buckets.get('ui')).toHaveLength(1);
   });
});
