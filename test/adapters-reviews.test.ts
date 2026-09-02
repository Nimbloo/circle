import { describe, it, expect } from 'vitest';
import {
   adaptReview,
   adaptReviewCommit,
   adaptReviewFile,
   splitFilePath,
} from '@/lib/adapters-reviews';
import type { ReviewDetailDto, ReviewDto } from '@/lib/api/reviews';

const BASE: ReviewDto = {
   id: 'x/y#1',
   title: 'T',
   status: 'open',
   repo: 'x/y',
   prNumber: 1,
   url: null,
   author: 'ana',
   targetBranch: 'main',
   sourceBranch: 'feat',
   additions: 1,
   deletions: 0,
   resolves: null,
   checksPassed: 1,
   checksTotal: 2,
   createdAt: '2026-09-01T00:00:00Z',
};

describe('adapters-reviews: arquivos e commits', () => {
   it('separa nome e diretório e classifica testes pelo caminho', () => {
      expect(splitFilePath('src/app/x.ts')).toEqual({ name: 'x.ts', path: 'src/app' });
      expect(splitFilePath('README.md')).toEqual({ name: 'README.md', path: '' });
      const cases: [string, 'tests' | 'implementation'][] = [
         ['test/app.test.ts', 'tests'],
         ['src/__tests__/a.tsx', 'tests'],
         ['lib/api/reviews.spec.ts', 'tests'],
         ['spec/models/x.rb', 'tests'],
         ['src/latest/x.ts', 'implementation'],
         ['src/contest.ts', 'implementation'],
      ];
      for (const [path, category] of cases) {
         expect(
            adaptReviewFile({ path, status: 'modified', additions: 0, deletions: 0, patch: null })
               .category,
            path
         ).toBe(category);
      }
   });

   it('commit: sha curto, primeira linha da mensagem e tempo relativo', () => {
      const c = adaptReviewCommit({
         sha: '1234567890abcdef',
         message: 'feat: x\n\ncorpo',
         author: 'ana',
         committedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      });
      expect(c).toEqual({ sha: '1234567', message: 'feat: x', timeAgo: '3h' });
      expect(
         adaptReviewCommit({ sha: 'a', message: 'm', author: null, committedAt: null }).timeAgo
      ).toBe('');
   });

   it('lista (sem detalhe) sai com files/commits vazios; detalhe preenche', () => {
      expect(adaptReview(BASE).files).toEqual([]);
      const detail: ReviewDetailDto = {
         ...BASE,
         files: [
            {
               path: 'src/a.ts',
               status: 'added',
               additions: 2,
               deletions: 1,
               patch: '@@ -0,0 +1 @@\n+a',
            },
         ],
         commits: [{ sha: 'abc', message: 'm', author: null, committedAt: null }],
      };
      const review = adaptReview(detail);
      expect(review.files).toHaveLength(1);
      expect(review.files[0]).toMatchObject({
         name: 'a.ts',
         path: 'src',
         status: 'added',
         patch: '@@ -0,0 +1 @@\n+a',
      });
      expect(review.commits[0].sha).toBe('abc');
   });
});
