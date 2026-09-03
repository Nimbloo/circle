// @vitest-environment jsdom

import './setup-dom';
import React, { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review, ReviewComment } from '@/data/reviews';
import type { ReviewCommentDto } from '@/lib/api/review-comments';
import { DiffView } from '@/components/common/reviews/diff-view';
import {
   ReviewCommentsSection,
   type ReviewCommentsHandle,
} from '@/components/common/reviews/review-comments';
import { patchToLines } from '@/lib/diff-patch';

const apiMocks = vi.hoisted(() => ({
   addComment: vi.fn(),
   updateComment: vi.fn(),
   removeComment: vi.fn(),
}));

vi.mock('@/lib/client', () => ({
   api: { reviews: apiMocks },
   ApiError: class ApiError extends Error {
      constructor(public readonly status: number) {
         super('api');
      }
   },
}));

vi.mock('sonner', () => ({
   toast: { success: vi.fn(), error: vi.fn() },
}));

const ANA = { id: 'u-ana', name: 'Ana', avatarUrl: null };
const BOB = { id: 'u-bob', name: 'Bob', avatarUrl: null };

function comment(over: Partial<ReviewComment> & { id: string }): ReviewComment {
   return {
      author: ANA,
      path: null,
      line: null,
      kind: 'comment',
      body: `body ${over.id}`,
      createdAt: '2026-09-01T00:00:00Z',
      timeAgo: '2h',
      ...over,
   };
}

function review(comments: ReviewComment[]): Review {
   return {
      id: 'x/y#7',
      title: 'Fix combobox',
      status: 'open',
      list: 'for-you',
      timeAgo: '1d',
      repo: 'x/y',
      prNumber: 7,
      targetBranch: 'main',
      sourceBranch: 'fix',
      additions: 3,
      deletions: 1,
      resolves: { identifier: '', title: '' },
      checksPassed: 0,
      checksTotal: 0,
      files: [],
      commits: [],
      summary: [],
      testPlan: [],
      guide: null,
      comments,
      verdict: null,
   };
}

function createdDto(over: Partial<ReviewCommentDto>): ReviewCommentDto {
   return {
      id: 'c-new',
      reviewId: 'x/y#7',
      author: ANA,
      path: null,
      line: null,
      kind: 'comment',
      body: '',
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
      ...over,
   };
}

/** Dono do estado (como o ReviewDetail): aplica `mutate` na thread e re-renderiza. */
function Harness({
   initial,
   meId = ANA.id,
   isAdmin = false,
   children,
}: {
   initial: ReviewComment[];
   meId?: string;
   isAdmin?: boolean;
   children: (comments: ReviewComment[], handle: ReviewCommentsHandle) => React.ReactNode;
}) {
   const [comments, setComments] = useState(initial);
   const handle: ReviewCommentsHandle = {
      reviewId: 'x/y#7',
      meId,
      isAdmin,
      mutate: (fn) => setComments((cs) => fn(cs)),
   };
   return <>{children(comments, handle)}</>;
}

describe('thread de comentários do review (Overview)', () => {
   beforeEach(() => {
      apiMocks.addComment.mockReset();
      apiMocks.updateComment.mockReset();
      apiMocks.removeComment.mockReset();
   });
   afterEach(() => vi.clearAllMocks());

   it('renderiza a thread com autor, badge do veredito e âncora arquivo:linha', () => {
      const comments = [
         comment({ id: 'c1', body: 'LGTM' }),
         comment({ id: 'c2', author: BOB, kind: 'request_changes', body: 'needs tests' }),
         comment({ id: 'c3', path: 'src/a.ts', line: 12, body: 'off by one' }),
      ];
      render(
         <Harness initial={comments}>
            {(cs, handle) => <ReviewCommentsSection review={review(cs)} handle={handle} />}
         </Harness>
      );

      const section = screen.getByRole('region', { name: 'Comments' });
      expect(within(section).getByText('LGTM')).toBeTruthy();
      expect(within(section).getByText('Bob')).toBeTruthy();
      expect(within(section).getByText('Changes requested')).toBeTruthy();
      expect(within(section).getByText('src/a.ts:12')).toBeTruthy();
      expect(within(section).getByRole('textbox', { name: 'Leave a comment' })).toBeTruthy();
   });

   it('só o autor edita; admin exclui de qualquer um', () => {
      const comments = [comment({ id: 'mine' }), comment({ id: 'theirs', author: BOB })];
      const { unmount } = render(
         <Harness initial={comments}>
            {(cs, handle) => <ReviewCommentsSection review={review(cs)} handle={handle} />}
         </Harness>
      );
      // Ana: edita/exclui o próprio, nada no do Bob.
      expect(screen.getAllByRole('button', { name: 'Edit comment' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
      unmount();

      render(
         <Harness initial={comments} meId="u-root" isAdmin>
            {(cs, handle) => <ReviewCommentsSection review={review(cs)} handle={handle} />}
         </Harness>
      );
      expect(screen.queryByRole('button', { name: 'Edit comment' })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(2);
   });

   it('composer posta via API e a thread ganha o comentário só depois da confirmação', async () => {
      const user = userEvent.setup();
      apiMocks.addComment.mockResolvedValue(createdDto({ body: 'Ship it' }));
      render(
         <Harness initial={[]}>
            {(cs, handle) => <ReviewCommentsSection review={review(cs)} handle={handle} />}
         </Harness>
      );
      expect(screen.getByText('No comments yet.')).toBeTruthy();

      await user.type(screen.getByRole('textbox', { name: 'Leave a comment' }), 'Ship it');
      await user.click(screen.getByRole('button', { name: 'Comment' }));

      expect(apiMocks.addComment).toHaveBeenCalledWith('x/y#7', {
         body: 'Ship it',
         path: null,
         line: null,
      });
      await waitFor(() => expect(screen.getByText('Ship it')).toBeTruthy());
      expect(screen.queryByText('No comments yet.')).toBeNull();
   });

   it('exclusão é otimista e volta ao estado anterior quando a API falha', async () => {
      const user = userEvent.setup();
      apiMocks.removeComment.mockRejectedValue(new Error('boom'));
      render(
         <Harness initial={[comment({ id: 'c1', body: 'keep me' })]}>
            {(cs, handle) => <ReviewCommentsSection review={review(cs)} handle={handle} />}
         </Harness>
      );
      await user.click(screen.getByRole('button', { name: 'Delete comment' }));
      await waitFor(() => expect(screen.getByText('keep me')).toBeTruthy());
      expect(apiMocks.removeComment).toHaveBeenCalledWith('x/y#7', 'c1');
   });
});

describe('composer inline no diff', () => {
   const PATCH = '@@ -1,2 +1,3 @@\n a\n+b\n c';
   const diff = {
      name: 'a.ts',
      path: 'src',
      additions: 1,
      deletions: 0,
      lines: patchToLines(PATCH),
   };

   beforeEach(() => apiMocks.addComment.mockReset());

   it('clique no número da linha abre o composer ancorado e posta com path + line', async () => {
      const user = userEvent.setup();
      apiMocks.addComment.mockResolvedValue(
         createdDto({ path: 'src/a.ts', line: 2, body: 'why b?' })
      );
      render(
         <Harness initial={[]}>
            {(cs, handle) => (
               <DiffView
                  diff={diff}
                  filePath="src/a.ts"
                  comments={cs.filter((c) => c.path === 'src/a.ts')}
                  handle={handle}
               />
            )}
         </Harness>
      );

      expect(screen.queryByRole('textbox', { name: 'Comment on line 2' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Comment on line 2' }));
      const box = screen.getByRole('textbox', { name: 'Comment on line 2' });
      await user.type(box, 'why b?');
      await user.click(screen.getByRole('button', { name: 'Comment' }));

      expect(apiMocks.addComment).toHaveBeenCalledWith('x/y#7', {
         body: 'why b?',
         path: 'src/a.ts',
         line: 2,
      });
      // Composer fecha e o comentário aparece ancorado sob a linha.
      await waitFor(() => expect(screen.getByText('why b?')).toBeTruthy());
      expect(screen.queryByRole('textbox', { name: 'Comment on line 2' })).toBeNull();
   });

   it('"Add comment" no cabeçalho abre o composer do arquivo (sem linha)', async () => {
      const user = userEvent.setup();
      render(
         <Harness initial={[]}>
            {(cs, handle) => (
               <DiffView diff={diff} filePath="src/a.ts" comments={cs} handle={handle} />
            )}
         </Harness>
      );
      await user.click(screen.getByRole('button', { name: 'Add comment' }));
      expect(screen.getByRole('textbox', { name: 'Comment on src/a.ts' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('textbox', { name: 'Comment on src/a.ts' })).toBeNull();
   });

   it('sem handle o DiffView continua só leitura (guide)', () => {
      render(<DiffView diff={diff} />);
      expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Comment on line/ })).toBeNull();
   });
});
