// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem, Attachment } from '@/data/issue-details';
import type { User } from '@/data/users';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { CommentComposer } from '@/components/common/issues/details/comment-composer';
import { AttachmentsSection } from '@/components/common/issues/details/attachments-section';
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
   attachments: { upload: vi.fn(), remove: vi.fn() },
   emojis: { list: vi.fn(async () => []) },
}));

vi.mock('@/lib/client', () => ({
   api: apiMocks,
   ApiError: class ApiError extends Error {
      constructor(public readonly status: number) {
         super('api');
      }
   },
}));

vi.mock('sonner', () => ({
   toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

// Radix (DropdownMenu) usa pointer capture, que o jsdom não implementa.
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
const CAROL = user('u-carol', 'Carol');

function me(id: string, admin = false) {
   useWorkspaceStore.setState({
      me: {
         id,
         slug: id,
         name: id,
         email: `${id}@nimbloo.ai`,
         avatarUrl: null,
         role: admin ? 'Admin' : 'Member',
         admin,
         teamIds: ['CORE'],
         subscribedIssueIds: [],
         githubLogin: null,
      },
      users: [],
   });
}

function comment(
   id: string,
   actor: User,
   text: string,
   over: Partial<Extract<ActivityItem, { kind: 'comment' }>> = {}
): Extract<ActivityItem, { kind: 'comment' }> {
   return {
      kind: 'comment',
      id,
      actor,
      timeAgo: '2h',
      body: [{ type: 'paragraph', text }],
      parentId: null,
      reactions: [],
      attachments: [],
      ...over,
   };
}

function attachment(id: string, over: Partial<Attachment> = {}): Attachment {
   return {
      id,
      url: `https://cdn.test/uploads/${id}.pdf`,
      fileName: `${id}.pdf`,
      contentType: 'application/pdf',
      size: 2048,
      commentId: null,
      uploadedById: 'u-ana',
      createdAt: '2026-09-01T00:00:00Z',
      ...over,
   };
}

const ISSUE = { teamId: 'CORE', projectId: 'P-1', assigneeId: 'u-bob' };

beforeEach(() => {
   vi.clearAllMocks();
   me('u-ana');
});

describe('threads no feed de atividade', () => {
   it('colapsa as respostas em "N replies · last X" quando são mais de 2 e expande ao clicar', async () => {
      const u = userEvent.setup();
      const root = comment('c1', ANA, 'raiz');
      const activity: ActivityItem[] = [
         root,
         comment('r1', BOB, 'resposta um', { parentId: 'c1', timeAgo: '1h' }),
         comment('r2', CAROL, 'resposta dois', { parentId: 'c1', timeAgo: '50m' }),
         comment('r3', BOB, 'resposta tres', { parentId: 'c1', timeAgo: '5m' }),
      ];
      render(<ActivityFeed activity={activity} issueId="I-1" issueContext={ISSUE} />);

      const summary = screen.getByRole('button', { name: /3 replies/ });
      expect(summary.textContent).toContain('3 replies· last 5m');
      expect(screen.queryByText('resposta um')).toBeNull();

      await u.click(summary);
      expect(screen.getByText('resposta um')).toBeTruthy();
      expect(screen.getByText('resposta tres')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /3 replies/ })).toBeNull();
   });

   it('até 2 respostas aparecem abertas', () => {
      const activity: ActivityItem[] = [
         comment('c1', ANA, 'raiz'),
         comment('r1', BOB, 'resposta um', { parentId: 'c1' }),
         comment('r2', CAROL, 'resposta dois', { parentId: 'c1' }),
      ];
      render(<ActivityFeed activity={activity} issueId="I-1" issueContext={ISSUE} />);
      expect(screen.getByText('resposta um')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /replies/ })).toBeNull();
   });

   it('mostra "edited" quando o comentário tem updatedAt', () => {
      render(
         <ActivityFeed
            activity={[
               comment('c1', ANA, 'editado', { updatedAt: '2026-09-02T10:00:00Z' }),
               comment('c2', BOB, 'intacto'),
            ]}
            issueId="I-1"
         />
      );
      expect(screen.getAllByText('· edited')).toHaveLength(1);
   });

   it('autor da raiz resolve a thread pelo menu "..." e o pai é avisado', async () => {
      const u = userEvent.setup({ pointerEventsCheck: 0 });
      apiMocks.comments.resolve.mockResolvedValue({});
      const onChanged = vi.fn();
      render(
         <ActivityFeed
            activity={[comment('c1', ANA, 'raiz')]}
            issueId="I-1"
            issueContext={ISSUE}
            onCommentAdded={onChanged}
         />
      );

      await u.click(screen.getByRole('button', { name: 'More actions' }));
      await u.click(await screen.findByRole('menuitem', { name: /Resolve thread/ }));

      await waitFor(() => expect(apiMocks.comments.resolve).toHaveBeenCalledWith('c1', true));
      expect(onChanged).toHaveBeenCalled();
   });

   it('quem não é autor, responsável nem admin não vê "Resolve thread"', async () => {
      me('u-carol');
      const u = userEvent.setup({ pointerEventsCheck: 0 });
      render(
         <ActivityFeed activity={[comment('c1', ANA, 'raiz')]} issueId="I-1" issueContext={ISSUE} />
      );
      await u.click(screen.getByRole('button', { name: 'More actions' }));
      await screen.findByRole('menuitem', { name: /Convert to sub-issue/ });
      expect(screen.queryByRole('menuitem', { name: /Resolve thread/ })).toBeNull();
   });

   it('thread resolvida fica compacta (check + "Resolved by"), esconde respostas e expande ao clicar', async () => {
      const u = userEvent.setup();
      render(
         <ActivityFeed
            activity={[
               comment('c1', ANA, 'decidido: vamos de OKLCH', {
                  resolvedAt: '2026-09-02T10:00:00Z',
                  resolvedBy: BOB,
               }),
               comment('r1', CAROL, 'concordo', { parentId: 'c1' }),
            ]}
            issueId="I-1"
            issueContext={ISSUE}
         />
      );
      const row = screen.getByRole('button', { expanded: false });
      expect(row.textContent).toContain('Resolved by Bob');
      expect(row.textContent).toContain('1 reply');
      expect(screen.queryByText('concordo')).toBeNull();

      await u.click(row);
      expect(screen.getByText('concordo')).toBeTruthy();
      expect(screen.getByText('Resolved')).toBeTruthy();
   });

   it('"Convert to sub-issue" cria a issue filha com parentId e o título na 1ª linha', async () => {
      const u = userEvent.setup({ pointerEventsCheck: 0 });
      apiMocks.issues.create.mockResolvedValue({ id: 'I-2', identifier: 'CORE-2' });
      apiMocks.comments.update.mockResolvedValue({});
      render(
         <ActivityFeed
            activity={[comment('c1', ANA, 'Trocar o focus trap\nusar DismissableLayer')]}
            issueId="I-1"
            issueContext={ISSUE}
         />
      );

      await u.click(screen.getByRole('button', { name: 'More actions' }));
      await u.click(await screen.findByRole('menuitem', { name: /Convert to sub-issue/ }));

      await waitFor(() => expect(apiMocks.issues.create).toHaveBeenCalledTimes(1));
      expect(apiMocks.issues.create.mock.calls[0][0]).toMatchObject({
         teamId: 'CORE',
         projectId: 'P-1',
         parentId: 'I-1',
         title: 'Trocar o focus trap',
         description: 'usar DismissableLayer',
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sub-issue CORE-2 created'));
      // autora do comentário → a referência é anexada ao corpo
      expect(apiMocks.comments.update).toHaveBeenCalledWith(
         'c1',
         expect.stringContaining('Sub-issue: CORE-2')
      );
   });

   it('anexos do comentário aparecem sob o corpo', () => {
      render(
         <ActivityFeed
            activity={[
               comment('c1', ANA, 'com anexo', {
                  attachments: [attachment('a1', { commentId: 'c1', fileName: 'spec.pdf' })],
               }),
            ]}
            issueId="I-1"
         />
      );
      expect(screen.getByText('spec.pdf')).toBeTruthy();
      expect(screen.getByText('2 KB')).toBeTruthy();
   });
});

describe('composer de comentário com anexos', () => {
   it('mostra o chip do arquivo antes de enviar e sobe o anexo ligado ao comentário criado', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'c-new' });
      apiMocks.attachments.upload.mockResolvedValue({ id: 'a-new' });
      const onPosted = vi.fn();
      render(<CommentComposer issueId="I-1" onPosted={onPosted} />);

      const file = new File(['%PDF-1.4'], 'notas.pdf', { type: 'application/pdf' });
      await u.upload(screen.getByLabelText('Attach file', { selector: 'input' }), file);

      const chip = screen.getByTestId('attachment-chip');
      expect(within(chip).getByText('notas.pdf')).toBeTruthy();
      expect(apiMocks.attachments.upload).not.toHaveBeenCalled();

      await u.type(screen.getByPlaceholderText(/Leave a comment/), 'segue o pdf');
      await u.click(screen.getByRole('button', { name: 'Comment' }));

      await waitFor(() => expect(onPosted).toHaveBeenCalled());
      expect(apiMocks.issues.addComment).toHaveBeenCalledWith('I-1', 'segue o pdf', null);
      expect(apiMocks.attachments.upload).toHaveBeenCalledWith('I-1', file, 'c-new');
      expect(screen.queryByTestId('attachment-chip')).toBeNull();
   });

   it('recusa localmente tipo fora da allow-list e remove o chip pendente', async () => {
      const u = userEvent.setup({ applyAccept: false });
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      const input = screen.getByLabelText('Attach file', { selector: 'input' });

      const bad = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
      await u.upload(input, bad);
      expect(toast.error).toHaveBeenCalledWith('x.svg: tipo de arquivo não permitido');
      expect(screen.queryByTestId('attachment-chip')).toBeNull();

      await u.upload(input, new File(['a'], 'ok.txt', { type: 'text/plain' }));
      expect(screen.getByTestId('attachment-chip')).toBeTruthy();
      await u.click(screen.getByRole('button', { name: 'Remove ok.txt' }));
      expect(screen.queryByTestId('attachment-chip')).toBeNull();
   });

   it('Ctrl+Shift+A abre o seletor de arquivo', async () => {
      const u = userEvent.setup();
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      const input = screen.getByLabelText('Attach file', { selector: 'input' });
      const click = vi.spyOn(input as HTMLInputElement, 'click');
      await u.click(screen.getByPlaceholderText(/Leave a comment/));
      await u.keyboard('{Control>}{Shift>}a{/Shift}{/Control}');
      expect(click).toHaveBeenCalled();
   });
});

describe('seção Attachments do detalhe', () => {
   it('lista chips com nome e tamanho, remove só pelo uploader/admin com confirmação inline', async () => {
      const u = userEvent.setup();
      apiMocks.attachments.remove.mockResolvedValue({ deleted: true });
      const onChanged = vi.fn();
      render(
         <AttachmentsSection
            attachments={[
               attachment('mine', { fileName: 'mine.pdf', uploadedById: 'u-ana', size: 1536 }),
               attachment('theirs', { fileName: 'theirs.zip', uploadedById: 'u-bob', size: 4096 }),
            ]}
            pending={[]}
            onAddFiles={() => {}}
            onChanged={onChanged}
         />
      );
      expect(screen.getByRole('heading', { name: /Attachments/ }).textContent).toContain('2');
      expect(screen.getByText('mine.pdf')).toBeTruthy();
      expect(screen.getByText('2 KB')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add attachment' })).toBeTruthy();

      expect(screen.getByRole('button', { name: 'Remove mine.pdf' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Remove theirs.zip' })).toBeNull();

      await u.click(screen.getByRole('button', { name: 'Remove mine.pdf' }));
      expect(apiMocks.attachments.remove).not.toHaveBeenCalled();
      await u.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(apiMocks.attachments.remove).toHaveBeenCalledWith('mine'));
      expect(onChanged).toHaveBeenCalled();
   });

   it('admin remove anexo de outro; "Add attachment" envia os arquivos escolhidos', async () => {
      me('u-dan', true);
      const u = userEvent.setup();
      const onAddFiles = vi.fn();
      render(
         <AttachmentsSection
            attachments={[attachment('theirs', { fileName: 'theirs.zip', uploadedById: 'u-bob' })]}
            pending={[
               {
                  id: 'p1',
                  fileName: 'subindo.txt',
                  contentType: 'text/plain',
                  size: 10,
                  uploading: true,
               },
            ]}
            onAddFiles={onAddFiles}
            onChanged={() => {}}
         />
      );
      expect(screen.getByRole('button', { name: 'Remove theirs.zip' })).toBeTruthy();
      expect(screen.getByText('Uploading…')).toBeTruthy();

      const file = new File(['a,b'], 'dados.csv', { type: 'text/csv' });
      await act(async () => {
         await u.upload(screen.getByLabelText('Add attachment', { selector: 'input' }), file);
      });
      expect(onAddFiles).toHaveBeenCalledWith([file]);
   });
});
