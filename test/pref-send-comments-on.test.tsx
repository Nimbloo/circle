// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentComposer } from '@/components/common/issues/details/comment-composer';
import { ReviewCommentComposer } from '@/components/common/reviews/review-comments';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const addComment = vi.hoisted(() => vi.fn());
const addReviewComment = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({
   api: { issues: { addComment }, emojis: { list: vi.fn(async () => []) } },
}));
vi.mock('@/lib/adapters-reviews', async (orig) => ({
   ...((await orig()) as object),
   addReviewComment,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('preferência "Send comments on..."', () => {
   beforeEach(() => {
      addComment.mockReset();
      addComment.mockResolvedValue({ id: 'c1' });
      addReviewComment.mockReset();
      addReviewComment.mockResolvedValue({ id: 'rc1', createdAt: '2026-01-01T00:00:00Z' });
      useWorkspaceStore.setState({ users: [] });
   });

   it('"Enter": Enter envia; Shift+Enter quebra a linha', async () => {
      usePreferencesStore.getState().setPref('sendCommentsOn', 'Enter');
      const user = userEvent.setup();
      render(<CommentComposer issueId="i1" onPosted={() => {}} />);
      const box = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.type(box, 'linha 1{Shift>}{Enter}{/Shift}linha 2');
      expect(box.value).toBe('linha 1\nlinha 2');
      expect(addComment).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(addComment).toHaveBeenCalledWith('i1', 'linha 1\nlinha 2', null));
   });

   it('"⌘+Enter": Enter só quebra a linha; Ctrl+Enter envia', async () => {
      usePreferencesStore.getState().setPref('sendCommentsOn', '⌘+Enter');
      const user = userEvent.setup();
      render(<CommentComposer issueId="i1" onPosted={() => {}} />);
      const box = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.type(box, 'a{Enter}b');
      expect(box.value).toBe('a\nb');
      expect(addComment).not.toHaveBeenCalled();
      await user.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
   });

   it('review: com "Enter", Enter envia o comentário', async () => {
      usePreferencesStore.getState().setPref('sendCommentsOn', 'Enter');
      const user = userEvent.setup();
      render(<ReviewCommentComposer handle={{ reviewId: 'r1', mutate: vi.fn() } as never} />);
      await user.type(screen.getByRole('textbox'), 'ok{Enter}');
      await waitFor(() => expect(addReviewComment).toHaveBeenCalledTimes(1));
   });
});
