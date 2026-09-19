// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem } from '@/data/issue-details';
import type { User } from '@/data/users';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { adaptActivity } from '@/lib/adapters-issue-detail';
import { blocksToMarkdown, textToBlocks } from '@/lib/text-blocks';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * is#2: editar um comentário reduzia o corpo aos parágrafos (listas, código e citações
 * sumiam ao salvar). is#3: a lixeira do comentário-raiz apagava a thread inteira sem
 * confirmação. is#22: a edição não tinha Ctrl+Enter/Esc.
 */

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

const RICH = [
   'Intro do comentário',
   '',
   '- item a',
   '- item b',
   '',
   '1. primeiro',
   '2. segundo',
   '',
   '- [x] feito',
   '- [ ] pendente',
   '',
   '```ts',
   'const x = 1;',
   '```',
   '',
   '> citação',
].join('\n');

function commentDto(id: string, body: string, parentId: string | null = null) {
   return {
      kind: 'comment' as const,
      id,
      actor: { id: 'u-ana', name: 'Ana', email: 'ana@nimbloo.ai', avatarUrl: null },
      createdAt: '2026-09-19T10:00:00.000Z',
      body,
      parentId,
      reactions: [],
      attachments: [],
   };
}

function Harness({ initial }: { initial: ActivityItem[] }) {
   const [activity, setActivity] = React.useState<ActivityItem[]>(initial);
   return (
      <ActivityFeed
         activity={activity}
         issueId="I-1"
         issueContext={{ teamId: 'CORE', assigneeId: null }}
         onCommentAdded={vi.fn()}
         onOwnAction={vi.fn()}
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

describe('blocksToMarkdown (is#2)', () => {
   it('é o inverso do textToBlocks para todos os blocos do comentário', () => {
      expect(textToBlocks(blocksToMarkdown(textToBlocks(RICH)))).toEqual(textToBlocks(RICH));
   });
});

describe('editar comentário preserva blocos (is#2)', () => {
   it('a edição abre com o markdown original e salvar sem mudar reenvia o mesmo texto', async () => {
      const u = userEvent.setup();
      apiMocks.comments.update.mockResolvedValue({});
      render(<Harness initial={adaptActivity([commentDto('c1', RICH)] as never)} />);
      await u.click(screen.getByRole('button', { name: 'Edit comment' }));
      const box = screen.getByRole('textbox', { name: 'Edit comment' }) as HTMLTextAreaElement;
      expect(box.value).toBe(RICH);
      await u.click(screen.getByRole('button', { name: 'Save' }));
      expect(apiMocks.comments.update).toHaveBeenCalledWith('c1', RICH);
      // Depois de salvar, a lista continua lá.
      expect(await screen.findByText('item a')).toBeTruthy();
      expect(screen.getByText('const x = 1;')).toBeTruthy();
   });

   it('Ctrl+Enter salva e Esc cancela a edição (is#22)', async () => {
      const u = userEvent.setup();
      apiMocks.comments.update.mockResolvedValue({});
      render(<Harness initial={adaptActivity([commentDto('c1', 'texto')] as never)} />);
      await u.click(screen.getByRole('button', { name: 'Edit comment' }));
      let box = screen.getByRole('textbox', { name: 'Edit comment' });
      fireEvent.keyDown(box, { key: 'Escape' });
      expect(screen.queryByRole('textbox', { name: 'Edit comment' })).toBeNull();
      expect(apiMocks.comments.update).not.toHaveBeenCalled();

      await u.click(screen.getByRole('button', { name: 'Edit comment' }));
      box = screen.getByRole('textbox', { name: 'Edit comment' });
      await u.type(box, ' novo');
      fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(apiMocks.comments.update).toHaveBeenCalledWith('c1', 'texto novo'));
   });
});

describe('excluir comentário pede confirmação (is#3)', () => {
   it('raiz com respostas: diálogo avisa que as respostas vão junto; só exclui ao confirmar', async () => {
      const u = userEvent.setup();
      apiMocks.comments.remove.mockResolvedValue({ deleted: true });
      const items = adaptActivity([
         commentDto('c1', 'raiz'),
         commentDto('r1', 'resposta 1', 'c1'),
         commentDto('r2', 'resposta 2', 'c1'),
      ] as never);
      render(<Harness initial={items} />);
      const rootCard = screen.getByText('raiz').closest('[data-comment-id]') as HTMLElement;
      await u.click(within(rootCard).getAllByRole('button', { name: 'Delete comment' })[0]);
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/2 replies/);
      expect(apiMocks.comments.remove).not.toHaveBeenCalled();

      await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(apiMocks.comments.remove).not.toHaveBeenCalled();

      await u.click(within(rootCard).getAllByRole('button', { name: 'Delete comment' })[0]);
      await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(apiMocks.comments.remove).toHaveBeenCalledWith('c1'));
   });

   it('comentário sem respostas também confirma', async () => {
      const u = userEvent.setup();
      apiMocks.comments.remove.mockResolvedValue({ deleted: true });
      render(<Harness initial={adaptActivity([commentDto('c1', 'sozinho')] as never)} />);
      await u.click(screen.getByRole('button', { name: 'Delete comment' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).not.toMatch(/repl/);
      expect(apiMocks.comments.remove).not.toHaveBeenCalled();
   });
});

describe('composer mantém o foco depois de enviar (is#22)', () => {
   it('o textarea não é desabilitado no envio (o navegador tiraria o foco) e segue focado', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'novo' });
      render(<Harness initial={[]} />);
      const box = screen.getByPlaceholderText(/Leave a comment/);
      await u.click(box);
      await u.type(box, 'oi');
      let resolve!: (v: unknown) => void;
      apiMocks.issues.addComment.mockReturnValue(new Promise((r) => (resolve = r)));
      fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(apiMocks.issues.addComment).toHaveBeenCalled());
      expect((box as HTMLTextAreaElement).disabled).toBe(false);
      expect((box as HTMLTextAreaElement).readOnly).toBe(true);
      resolve({ id: 'novo' });
      await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
      await waitFor(() => expect(document.activeElement).toBe(box));
   });
});
