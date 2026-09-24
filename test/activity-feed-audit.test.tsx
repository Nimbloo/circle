// @vitest-environment jsdom

import './setup-dom';
import React, { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem, ContentBlock } from '@/data/issue-details';
import type { User } from '@/data/users';
import { ActivityFeed, type CommentPatch } from '@/components/common/issues/details/activity-feed';
import { useWorkspaceStore } from '@/store/workspace-store';
import { COMMENT_MAX_LENGTH } from '@/lib/comment-limits';

const apiMocks = vi.hoisted(() => ({
   issues: { create: vi.fn(), addComment: vi.fn() },
   comments: {
      resolve: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      addReaction: vi.fn(),
      removeReaction: vi.fn(),
   },
   attachments: { upload: vi.fn(), remove: vi.fn() },
   emojis: { list: vi.fn(async () => []) },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

// Sonda de render: cada card desenha o corpo com ContentBlocks.
const bodyRenders = vi.hoisted(() => new Map<string, number>());
vi.mock('@/components/common/issues/details/content-blocks', () => ({
   ContentBlocks: ({ blocks }: { blocks: ContentBlock[] }) => {
      const text = blocks.map((b) => ('text' in b ? b.text : '')).join(' ');
      bodyRenders.set(text, (bodyRenders.get(text) ?? 0) + 1);
      return <p>{text}</p>;
   },
}));

for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

function user(id: string, name: string): User {
   return {
      id,
      name,
      email: `${name.toLowerCase()}@nimbloo.ai`,
      avatarUrl: '',
      status: 'offline',
      role: 'Member',
      joinedDate: '2026-01-01',
      teamIds: ['CORE'],
      timezone: 'UTC',
   };
}
const ANA = user('u-ana', 'Ana');
const BOB = user('u-bob', 'Bob');
type CommentItem = Extract<ActivityItem, { kind: 'comment' }>;
const comment = (id: string, actor: User, text: string, over: Partial<CommentItem> = {}) =>
   ({
      kind: 'comment',
      id,
      actor,
      timeAgo: '2h',
      body: [{ type: 'paragraph', text }],
      parentId: null,
      reactions: [],
      attachments: [],
      ...over,
   }) as CommentItem;

const ISSUE = { teamId: 'CORE', projectId: null, assigneeId: null };

beforeEach(() => {
   vi.clearAllMocks();
   bodyRenders.clear();
   try {
      window.sessionStorage.clear();
   } catch {
      /* sem storage */
   }
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

/** Dono do estado com callbacks estáveis (como o IssueDetailView). */
function Harness({ initial, onReload }: { initial: ActivityItem[]; onReload?: () => void }) {
   const [activity, setActivity] = useState(initial);
   const patch = useCallback(
      (id: string, p: CommentPatch) =>
         setActivity((list) =>
            list.map((it) => (it.kind === 'comment' && it.id === id ? { ...it, ...p } : it))
         ),
      []
   );
   const removed = useCallback(
      (id: string) => setActivity((list) => list.filter((it) => it.id !== id)),
      []
   );
   const reload = useCallback(() => onReload?.(), [onReload]);
   const own = useCallback(() => {}, []);
   return (
      <ActivityFeed
         activity={activity}
         issueId="I-1"
         issueContext={ISSUE}
         onCommentAdded={reload}
         onCommentPatch={patch}
         onCommentRemoved={removed}
         onOwnAction={own}
      />
   );
}

describe('feed — respostas e paginação', () => {
   it('resposta cuja raiz não veio no feed aparece como item de topo (não some)', () => {
      render(
         <ActivityFeed
            activity={[comment('r1', BOB, 'resposta órfã', { parentId: 'raiz-sumida' })]}
            issueId="I-1"
            issueContext={ISSUE}
         />
      );
      expect(screen.getByText('resposta órfã')).toBeTruthy();
   });

   it('"Show older activity" no topo carrega a página anterior', async () => {
      const u = userEvent.setup();
      const onLoadOlder = vi.fn();
      const { rerender } = render(
         <ActivityFeed
            activity={[comment('c1', ANA, 'um')]}
            issueId="I-1"
            issueContext={ISSUE}
            hasOlder
            onLoadOlder={onLoadOlder}
         />
      );
      await u.click(screen.getByRole('button', { name: 'Show older activity' }));
      expect(onLoadOlder).toHaveBeenCalledTimes(1);
      rerender(
         <ActivityFeed
            activity={[comment('c1', ANA, 'um')]}
            issueId="I-1"
            issueContext={ISSUE}
            hasOlder={false}
            onLoadOlder={onLoadOlder}
         />
      );
      expect(screen.queryByRole('button', { name: 'Show older activity' })).toBeNull();
   });
});

describe('feed — eco da própria ação', () => {
   it('comentar marca a ação própria antes da resposta do POST', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockReturnValue(new Promise(() => {}));
      const onOwn = vi.fn();
      render(<ActivityFeed activity={[]} issueId="I-1" issueContext={ISSUE} onOwnAction={onOwn} />);
      await u.type(screen.getByRole('textbox', { name: 'Comment' }), 'oi');
      await u.click(screen.getByRole('button', { name: 'Comment' }));
      expect(onOwn).toHaveBeenCalled();
   });
});

describe('feed — acessibilidade', () => {
   it('chip de reação tem rótulo com contagem e se eu reagi', () => {
      render(
         <ActivityFeed
            activity={[
               comment('c1', BOB, 'oi', {
                  reactions: [
                     { emoji: '👍', count: 2, reactedByMe: true },
                     { emoji: '🎉', count: 1, reactedByMe: false },
                  ],
               }),
            ]}
            issueId="I-1"
            issueContext={ISSUE}
         />
      );
      expect(screen.getByRole('button', { name: '👍: 2 reactions, including you' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '🎉: 1 reaction' })).toBeTruthy();
   });

   it('excluir comentário devolve o foco ao composer', async () => {
      const u = userEvent.setup();
      apiMocks.comments.remove.mockResolvedValue({ deleted: true });
      render(<Harness initial={[comment('c1', ANA, 'meu comentário')]} />);
      await u.click(screen.getByRole('button', { name: 'Delete comment' }));
      await u.click(await screen.findByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText('meu comentário')).toBeNull());
      await waitFor(() =>
         expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Comment' }))
      );
   });

   it('enviar resposta devolve o foco ao botão Reply da thread', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'r-new' });
      render(<Harness initial={[comment('c1', BOB, 'raiz')]} />);
      const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
      await u.click(replyButtons[replyButtons.length - 1]);
      await u.type(screen.getByRole('textbox', { name: 'Reply' }), 'resposta');
      await u.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Reply' })).toBeNull());
      await waitFor(() => {
         const el = document.activeElement as HTMLElement;
         expect(el.tagName).toBe('BUTTON');
         expect(el.textContent).toContain('Reply');
      });
   });
});

describe('feed — limite de tamanho', () => {
   it('edição do comentário tem o mesmo maxLength da API', async () => {
      const u = userEvent.setup();
      render(<Harness initial={[comment('c1', ANA, 'meu')]} />);
      await u.click(screen.getByRole('button', { name: 'Edit comment' }));
      const box = screen.getByRole('textbox', { name: 'Edit comment' }) as HTMLTextAreaElement;
      expect(box.maxLength).toBe(COMMENT_MAX_LENGTH);
   });
});

describe('feed — render', () => {
   it('reagir num comentário não re-renderiza os outros cards', async () => {
      const u = userEvent.setup();
      apiMocks.comments.addReaction.mockReturnValue(new Promise(() => {}));
      render(
         <Harness
            initial={[
               comment('c1', BOB, 'primeiro'),
               comment('c2', BOB, 'segundo'),
               comment('c3', BOB, 'terceiro'),
            ]}
         />
      );
      const before = { ...Object.fromEntries(bodyRenders) };
      await u.click(screen.getAllByRole('button', { name: 'Add reaction' })[0]);
      await u.click(screen.getByRole('button', { name: '👍' }));
      await screen.findByRole('button', { pressed: true });
      expect(bodyRenders.get('segundo')).toBe(before.segundo);
      expect(bodyRenders.get('terceiro')).toBe(before.terceiro);
   });
});
