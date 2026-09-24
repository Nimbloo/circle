// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/data/users';
import { CommentComposer } from '@/components/common/issues/details/comment-composer';
import { COMMENT_MAX_LENGTH } from '@/lib/comment-limits';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({
   issues: { addComment: vi.fn() },
   attachments: { upload: vi.fn() },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function user(id: string, name: string, email: string): User {
   return {
      id,
      name,
      email,
      avatarUrl: '',
      status: 'offline',
      role: 'Member',
      joinedDate: '2026-01-01',
      teamIds: ['CORE'],
      timezone: 'UTC',
   };
}

beforeEach(() => {
   vi.clearAllMocks();
   try {
      window.sessionStorage.clear();
   } catch {
      /* sem storage */
   }
   useWorkspaceStore.setState({
      users: [
         user('u-bob', 'Bob', 'bob@nimbloo.ai'),
         user('u-dan', 'Danilo', 'danilo@nimbloo.ai'),
         user('u-dsi', 'Danilo Simei', 'danilo.simei@nimbloo.ai'),
      ],
   });
});
afterEach(() => {
   vi.restoreAllMocks();
   vi.unstubAllGlobals();
});

const box = () => screen.getByRole('textbox', { name: 'Comment' }) as HTMLTextAreaElement;

describe('composer — anexos que falham', () => {
   it('comentário criado e 1 de 2 anexos falha: só o que falhou fica, com retry no mesmo comentário', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'c-new' });
      apiMocks.attachments.upload
         .mockResolvedValueOnce({ id: 'a1' })
         .mockRejectedValueOnce(new Error('rede caiu'));
      const onPosted = vi.fn();
      render(<CommentComposer issueId="I-1" onPosted={onPosted} />);
      const ok = new File(['a'], 'ok.txt', { type: 'text/plain' });
      const bad = new File(['b'], 'ruim.txt', { type: 'text/plain' });
      await u.upload(screen.getByLabelText('Attach file', { selector: 'input' }), [ok, bad]);
      await u.type(box(), 'segue');
      await u.click(screen.getByRole('button', { name: 'Comment' }));

      await waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
      expect(box().value).toBe('');
      const chips = screen.getAllByTestId('attachment-chip');
      expect(chips).toHaveLength(1);
      expect(within(chips[0]).getByText('ruim.txt')).toBeTruthy();

      apiMocks.attachments.upload.mockResolvedValueOnce({ id: 'a2' });
      await u.click(screen.getByRole('button', { name: 'Retry upload' }));
      await waitFor(() => expect(screen.queryByTestId('attachment-chip')).toBeNull());
      expect(apiMocks.attachments.upload).toHaveBeenLastCalledWith('I-1', bad, 'c-new');
      expect(apiMocks.issues.addComment).toHaveBeenCalledTimes(1);
      expect(onPosted).toHaveBeenCalledTimes(2);
   });

   it('upload longo não prende o composer em "Posting…"/readOnly', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockResolvedValue({ id: 'c-new' });
      apiMocks.attachments.upload.mockReturnValue(new Promise(() => {}));
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      await u.upload(
         screen.getByLabelText('Attach file', { selector: 'input' }),
         new File(['a'], 'grande.zip', { type: 'application/zip' })
      );
      await u.type(box(), 'segue');
      await u.click(screen.getByRole('button', { name: 'Comment' }));
      await waitFor(() => expect(apiMocks.attachments.upload).toHaveBeenCalled());
      expect(box().readOnly).toBe(false);
      expect(screen.queryByText('Posting…')).toBeNull();
      expect(screen.getByText('Uploading…')).toBeTruthy();
   });
});

describe('composer — eco da própria ação', () => {
   it('avisa a ação própria ANTES do POST (o eco do SSE chega antes da resposta)', async () => {
      const u = userEvent.setup();
      apiMocks.issues.addComment.mockReturnValue(new Promise(() => {}));
      const onSubmitStart = vi.fn();
      render(<CommentComposer issueId="I-1" onPosted={() => {}} onSubmitStart={onSubmitStart} />);
      await u.type(box(), 'oi');
      await u.click(screen.getByRole('button', { name: 'Comment' }));
      expect(onSubmitStart).toHaveBeenCalledTimes(1);
      expect(apiMocks.issues.addComment).toHaveBeenCalled();
   });
});

describe('composer — autocomplete de menção', () => {
   it('pontuação no fim de um slug completo fecha a lista (Enter não troca por outro usuário)', async () => {
      const u = userEvent.setup();
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      await u.type(box(), '@danilo');
      expect(screen.getByRole('listbox')).toBeTruthy();
      await u.type(box(), '.');
      expect(screen.queryByRole('listbox')).toBeNull();
      // continuar digitando o slug composto reabre
      await u.type(box(), 's');
      expect(within(screen.getByRole('listbox')).getByText('Danilo Simei')).toBeTruthy();
   });

   it('Enter de composição de IME não seleciona a sugestão', async () => {
      const u = userEvent.setup();
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      await u.type(box(), '@bo');
      fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229 });
      expect(box().value).toBe('@bo');
      fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
      expect(box().value).toBe('@bo');
   });

   it('lista acessível: listbox/option, aria-expanded, aria-controls e aria-activedescendant', async () => {
      const u = userEvent.setup();
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      expect(box().getAttribute('aria-expanded')).toBe('false');
      await u.type(box(), '@dan');
      const list = screen.getByRole('listbox');
      const options = within(list).getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(box().getAttribute('aria-expanded')).toBe('true');
      expect(box().getAttribute('aria-controls')).toBe(list.id);
      expect(box().getAttribute('aria-activedescendant')).toBe(options[0].id);
      expect(options[0].getAttribute('aria-selected')).toBe('true');
      await u.keyboard('{ArrowDown}');
      expect(box().getAttribute('aria-activedescendant')).toBe(options[1].id);
   });
});

describe('composer — limite, rascunho e altura', () => {
   it('maxLength alinhado à API e contador perto do limite', () => {
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      expect(box().maxLength).toBe(COMMENT_MAX_LENGTH);
      expect(screen.queryByText(`10/${COMMENT_MAX_LENGTH}`)).toBeNull();
      fireEvent.change(box(), { target: { value: 'x'.repeat(COMMENT_MAX_LENGTH - 100) } });
      expect(screen.getByText(`${COMMENT_MAX_LENGTH - 100}/${COMMENT_MAX_LENGTH}`)).toBeTruthy();
   });

   it('rascunho sobrevive à troca de issue e é limpo ao enviar', async () => {
      const u = userEvent.setup();
      const { unmount } = render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      await u.type(box(), 'meio escrito');
      unmount();

      const b = render(<CommentComposer issueId="I-2" onPosted={() => {}} />);
      expect(box().value).toBe('');
      b.unmount();

      apiMocks.issues.addComment.mockResolvedValue({ id: 'c-new' });
      const a = render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      expect(box().value).toBe('meio escrito');
      await u.click(screen.getByRole('button', { name: 'Comment' }));
      await waitFor(() => expect(box().value).toBe(''));
      a.unmount();
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      expect(box().value).toBe('');
   });

   it('cresce com o conteúdo (field-sizing) e, sem suporte, ajusta a altura pelo scrollHeight', () => {
      vi.stubGlobal('CSS', { supports: () => false });
      render(<CommentComposer issueId="I-1" onPosted={() => {}} />);
      expect(box().className).toContain('field-sizing-content');
      vi.spyOn(box(), 'scrollHeight', 'get').mockReturnValue(120);
      fireEvent.change(box(), { target: { value: 'a\nb\nc\nd\ne' } });
      expect(box().style.height).toBe('120px');
   });
});
