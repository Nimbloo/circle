// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { SLASH_ITEMS } from '@/components/common/editor/slash-command';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/lib/client', () => ({ api: { issues: {}, uploads: {} } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

async function mount() {
   let editor: Editor | null = null;
   const utils = render(
      <BlockEditor doc={blocksToDoc([])} onReady={(e) => (editor = e)} saveDelayMs={0} />
   );
   await waitFor(() => expect(editor).not.toBeNull());
   return { ...utils, editor: editor as unknown as Editor };
}

/** Dispara o item "Video" do menu "/" com a seleção atual (é o que o Suggestion faz). */
function runVideoItem(editor: Editor) {
   const item = SLASH_ITEMS.find((i) => i.id === 'video')!;
   const at = editor.state.selection.from;
   act(() => {
      item.run(editor, { from: at, to: at });
   });
}

const json = (editor: Editor): EditorDoc => editor.getJSON() as EditorDoc;

describe('BlockEditor — vídeo pelo menu "/" (popover inline)', () => {
   it('abre o popover com input em vez de window.prompt e insere o vídeo no Enter', async () => {
      const prompt = vi.fn();
      vi.stubGlobal('prompt', prompt);
      const { editor } = await mount();
      act(() => {
         editor.commands.focus('end');
      });
      runVideoItem(editor);

      expect(prompt).not.toHaveBeenCalled();
      const input = await screen.findByLabelText('Video URL');
      fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
      await act(async () => {
         fireEvent.keyDown(screen.getByLabelText('Video URL'), { key: 'Enter' });
      });

      const video = json(editor).content?.find((n) => n.type === 'video');
      expect(video?.attrs).toMatchObject({
         src: 'https://youtu.be/dQw4w9WgXcQ',
         provider: 'youtube',
      });
      await waitFor(() => expect(screen.queryByLabelText('Video URL')).toBeNull());
      vi.unstubAllGlobals();
   });

   it('URL não suportada mostra erro inline e mantém o popover aberto', async () => {
      const { editor } = await mount();
      act(() => {
         editor.commands.focus('end');
      });
      runVideoItem(editor);

      const input = await screen.findByLabelText('Video URL');
      fireEvent.change(input, { target: { value: 'https://example.com/pagina' } });
      await act(async () => {
         fireEvent.keyDown(screen.getByLabelText('Video URL'), { key: 'Enter' });
      });

      expect(screen.getByRole('alert').textContent).toContain('URL não suportada');
      expect(json(editor).content?.some((n) => n.type === 'video')).toBe(false);
      expect(screen.queryByLabelText('Video URL')).not.toBeNull();
   });

   it('Esc fecha o popover sem inserir nada', async () => {
      const { editor } = await mount();
      act(() => {
         editor.commands.focus('end');
      });
      runVideoItem(editor);

      const input = await screen.findByLabelText('Video URL');
      fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
      await act(async () => {
         fireEvent.keyDown(screen.getByLabelText('Video URL'), { key: 'Escape' });
      });

      await waitFor(() => expect(screen.queryByLabelText('Video URL')).toBeNull());
      expect(json(editor).content?.some((n) => n.type === 'video')).toBe(false);
   });
});
