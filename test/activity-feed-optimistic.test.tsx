// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem } from '@/data/issue-details';
import type { User } from '@/data/users';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { useWorkspaceStore } from '@/store/workspace-store';
import { toast } from 'sonner';

const apiMocks = vi.hoisted(() => ({
   issues: { create: vi.fn(), addComment: vi.fn() },
   comments: {
      resolve: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      addReaction: vi.fn(),
      removeReaction: vi.fn(),
   },
   emojis: { list: vi.fn(async () => []) },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const ANA: User = {
   id: 'u-ana',
   name: 'Ana',
   email: 'ana@nimbloo.ai',
   avatarUrl: '',
   status: 'offline',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: ['CORE'],
   timezone: 'UTC',
};
type CommentItem = Extract<ActivityItem, { kind: 'comment' }>;
const comment: CommentItem = {
   kind: 'comment',
   id: 'c1',
   actor: ANA,
   timeAgo: '2h',
   body: [{ type: 'paragraph', text: 'texto original' }],
   parentId: null,
   reactions: [],
   attachments: [],
};

/** Dono do estado (como o IssueDetailView): aplica os patches otimistas do feed. */
function Harness({ onReload, onOwn }: { onReload: () => void; onOwn: () => void }) {
   const [activity, setActivity] = React.useState<ActivityItem[]>([comment]);
   return (
      <ActivityFeed
         activity={activity}
         issueId="I-1"
         issueContext={{ teamId: 'CORE', assigneeId: null }}
         onCommentAdded={onReload}
         onOwnAction={onOwn}
         onCommentPatch={(id, patch) =>
            setActivity((list) =>
               list.map((it) => (it.kind === 'comment' && it.id === id ? { ...it, ...patch } : it))
            )
         }
      />
   );
}

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({
      me: {
         id: 'u-ana',
         slug: 'ana',
         name: 'Ana',
         email: 'ana@nimbloo.ai',
         avatarUrl: null,
         role: 'Member',
         admin: false,
         teamIds: ['CORE'],
         subscribedIssueIds: [],
         githubLogin: null,
      },
      users: [],
   });
});

describe('#27 ações de comentário otimistas', () => {
   it('reação aparece antes da API e não recarrega o detail', async () => {
      const u = userEvent.setup();
      const onReload = vi.fn();
      const onOwn = vi.fn();
      apiMocks.comments.addReaction.mockReturnValue(new Promise(() => {}));
      render(<Harness onReload={onReload} onOwn={onOwn} />);
      await u.click(screen.getByRole('button', { name: 'Add reaction' }));
      await u.click(screen.getByRole('button', { name: '👍' }));
      const chip = await screen.findByRole('button', { pressed: true });
      expect(chip.textContent).toContain('1');
      expect(apiMocks.comments.addReaction).toHaveBeenCalledWith('c1', '👍');
      expect(onReload).not.toHaveBeenCalled();
      expect(onOwn).toHaveBeenCalled();
   });

   it('falha da reação desfaz o otimista e avisa', async () => {
      const u = userEvent.setup();
      apiMocks.comments.addReaction.mockRejectedValue(new Error('x'));
      render(<Harness onReload={vi.fn()} onOwn={vi.fn()} />);
      await u.click(screen.getByRole('button', { name: 'Add reaction' }));
      await u.click(screen.getByRole('button', { name: '👍' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.queryByRole('button', { pressed: true })).toBeNull();
   });

   it('edição aparece na hora, sem refetch', async () => {
      const u = userEvent.setup();
      const onReload = vi.fn();
      apiMocks.comments.update.mockReturnValue(new Promise(() => {}));
      render(<Harness onReload={onReload} onOwn={vi.fn()} />);
      await u.click(screen.getByRole('button', { name: 'Edit comment' }));
      const box = screen.getByDisplayValue('texto original');
      await u.clear(box);
      await u.type(box, 'texto novo');
      await u.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('texto novo')).toBeTruthy();
      expect(apiMocks.comments.update).toHaveBeenCalledWith('c1', 'texto novo');
      expect(onReload).not.toHaveBeenCalled();
   });
});
