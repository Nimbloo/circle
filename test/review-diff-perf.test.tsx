// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review, ReviewComment } from '@/data/reviews';

vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Sonda: o cabeçalho de cada DiffView desenha um DiffStat por render.
const statRenders = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/components/common/reviews/review-shared', async (orig) => {
   const real = await orig<typeof import('@/components/common/reviews/review-shared')>();
   return {
      ...real,
      DiffStat: (props: { additions: number; deletions: number }) => {
         statRenders.n += 1;
         return <real.DiffStat {...props} />;
      },
   };
});

import { patchToLines } from '@/lib/diff-patch';
import { ReviewDiff } from '@/components/common/reviews/review-diff';
import type { ReviewCommentsHandle } from '@/components/common/reviews/review-comments';

/**
 * #47 — o diff re-parseava todos os patches e re-renderizava todos os arquivos a cada
 * render (evento de outro comentário, checks), sem colapso de arquivo grande; o
 * "Reviewed" era um checkbox morto.
 */
const patch = (n: number) =>
   `@@ -1,${n} +1,${n} @@\n` + Array.from({ length: n }, (_, i) => ` line ${i}`).join('\n');

const file = (name: string, lines = 3) => ({
   name,
   path: 'src',
   additions: 1,
   deletions: 0,
   category: 'implementation' as const,
   patch: patch(lines),
});

const baseReview = (files = [file('a.ts'), file('b.ts')], comments: ReviewComment[] = []) =>
   ({ id: 'x/y#1', files, commits: [], comments }) as unknown as Review;

const handle: ReviewCommentsHandle = {
   reviewId: 'x/y#1',
   meId: 'u1',
   isAdmin: false,
   mutate: () => {},
};

const comment = (path: string): ReviewComment => ({
   id: `c-${path}`,
   author: { id: 'u2', name: 'Bia', avatarUrl: null },
   path,
   line: null,
   kind: 'comment',
   body: 'oi',
   createdAt: '2026-09-01T00:00:00.000Z',
   timeAgo: '1h',
});

beforeEach(() => {
   statRenders.n = 0;
   try {
      window.localStorage.clear();
   } catch {
      /* sem storage */
   }
});

describe('diff eficiente (#47)', () => {
   it('mesmo patch devolve as mesmas linhas (parse memoizado)', () => {
      const p = patch(5);
      expect(patchToLines(p)).toBe(patchToLines(p));
   });

   it('comentário novo em um arquivo re-renderiza só aquele arquivo', () => {
      const files = [file('a.ts'), file('b.ts'), file('c.ts')];
      const { rerender } = render(<ReviewDiff review={baseReview(files)} handle={handle} />);
      statRenders.n = 0;
      // Recarga por evento: objeto novo, mesmos arquivos/patches, um comentário a mais.
      rerender(
         <ReviewDiff
            review={baseReview(
               files.map((f) => ({ ...f })),
               [comment('src/b.ts')]
            )}
            handle={handle}
         />
      );
      expect(statRenders.n).toBe(1);
   });

   it('arquivo grande começa colapsado e abre sob demanda', () => {
      render(<ReviewDiff review={baseReview([file('big.ts', 1200)])} handle={handle} />);
      expect(screen.queryByText('line 5')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Load diff/ }));
      expect(screen.getByText('line 5')).toBeTruthy();
   });

   it('"Reviewed" colapsa o arquivo', () => {
      render(<ReviewDiff review={baseReview([file('a.ts')])} handle={handle} />);
      expect(screen.getByText('line 1')).toBeTruthy();
      act(() => {
         fireEvent.click(screen.getByRole('checkbox', { name: /Reviewed/ }));
      });
      expect(screen.queryByText('line 1')).toBeNull();
   });
});
