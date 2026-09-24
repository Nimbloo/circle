// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem } from '@/data/issue-details';
import type { User } from '@/data/users';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * CodeRabbit #190: com anexo grande, o texto saía do composer mas o comentário só
 * aparecia no feed depois do upload (o eco SSE próprio é ignorado). O feed recarrega
 * assim que o comentário é criado, e de novo quando os anexos terminam.
 */

const apiMocks = vi.hoisted(() => ({
   issues: { addComment: vi.fn() },
   attachments: { upload: vi.fn() },
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
const comment: ActivityItem = {
   kind: 'comment',
   id: 'c1',
   actor: ANA,
   timeAgo: '2h',
   body: [{ type: 'paragraph', text: 'comentário raiz' }],
   parentId: null,
   reactions: [],
   attachments: [],
};

beforeEach(() => {
   vi.clearAllMocks();
   try {
      window.sessionStorage.clear();
   } catch {
      /* sem storage */
   }
   useWorkspaceStore.setState({ users: [] });
});

function deferred<T>() {
   let resolve!: (v: T) => void;
   const promise = new Promise<T>((r) => (resolve = r));
   return { promise, resolve };
}

describe('feed recarrega quando o comentário é criado (CodeRabbit #190)', () => {
   it('composer principal: recarrega antes do upload terminar e de novo depois', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'c-new' });
      const upload = deferred<{ id: string }>();
      apiMocks.attachments.upload.mockReturnValue(upload.promise);
      const onReload = vi.fn();
      render(<ActivityFeed activity={[comment]} issueId="I-1" onCommentAdded={onReload} />);

      const box = screen.getByRole('textbox', { name: 'Comment' });
      await u.upload(
         screen.getByLabelText('Attach file', { selector: 'input' }),
         new File(['a'], 'grande.zip', { type: 'application/zip' })
      );
      await u.type(box, 'segue');
      await u.click(screen.getByRole('button', { name: 'Comment' }));
      await waitFor(() => expect(apiMocks.attachments.upload).toHaveBeenCalled());
      expect(onReload).toHaveBeenCalledTimes(1);

      upload.resolve({ id: 'a1' });
      await waitFor(() => expect(onReload).toHaveBeenCalledTimes(2));
   });

   it('resposta: recarrega antes do upload terminar; o composer só fecha depois', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'c-reply' });
      const upload = deferred<{ id: string }>();
      apiMocks.attachments.upload.mockReturnValue(upload.promise);
      const onReload = vi.fn();
      render(<ActivityFeed activity={[comment]} issueId="I-1" onCommentAdded={onReload} />);

      await u.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
      const reply = screen.getByPlaceholderText('Reply… (@ to mention)');
      // Raiz do composer de resposta: o menor ancestral que tem o input de arquivo.
      let root: HTMLElement = reply;
      while (!root.querySelector('input[type=file]')) root = root.parentElement!;
      await u.upload(
         root.querySelector<HTMLInputElement>('input[type=file]')!,
         new File(['a'], 'grande.zip', { type: 'application/zip' })
      );
      await u.type(reply, 'resposta');
      const submit = within(root)
         .getAllByRole('button', { name: 'Reply' })
         .find((b) => b.getAttribute('type') === 'submit' || b.textContent === 'Reply')!;
      await u.click(submit);
      await waitFor(() => expect(apiMocks.attachments.upload).toHaveBeenCalled());
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(screen.queryByPlaceholderText('Reply… (@ to mention)')).not.toBeNull();

      upload.resolve({ id: 'a1' });
      await waitFor(() => expect(onReload).toHaveBeenCalledTimes(2));
      await waitFor(() =>
         expect(screen.queryByPlaceholderText('Reply… (@ to mention)')).toBeNull()
      );
   });
});
