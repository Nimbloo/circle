// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

const paragraph = (text: string): EditorDoc => blocksToDoc([{ type: 'paragraph', text }]);

/** Monta o editor e espera o Tiptap criar a instância (immediatelyRender: false). */
async function mount(props: Partial<React.ComponentProps<typeof BlockEditor>> = {}) {
   let editor: Editor | null = null;
   const utils = render(
      <BlockEditor
         doc={paragraph('local')}
         onReady={(e) => (editor = e)}
         saveDelayMs={0}
         {...props}
      />
   );
   await waitFor(() => expect(editor).not.toBeNull());
   return { ...utils, editor: editor as unknown as Editor };
}

describe('BlockEditor — auditoria 23/09', () => {
   afterEach(() => vi.useRealTimers());

   it('undo não desfaz o doc que veio de fora (update remoto)', async () => {
      const { editor, rerender } = await mount({ doc: paragraph('local') });
      act(() => {
         editor.chain().focus('end').insertContent(' editado').run();
         editor.commands.blur();
      });
      expect(editor.getText()).toBe('local editado');

      const remote = paragraph('versão remota');
      rerender(<BlockEditor doc={remote} saveDelayMs={0} />);
      await waitFor(() => expect(editor.getText()).toBe('versão remota'));

      act(() => {
         editor.commands.undo();
      });
      expect(editor.getText()).toBe('versão remota');
   });
});

describe('BlockEditor — upload de imagem e autosave', () => {
   const png = () => new File(['x'], 'tela.png', { type: 'image/png' });
   const hasPlaceholder = (d: EditorDoc) => /blob:|"uploading":true/.test(JSON.stringify(d));

   it('não salva o placeholder blob: enquanto o upload corre; salva a URL final ao concluir', async () => {
      Object.assign(URL, { createObjectURL: () => 'blob:placeholder', revokeObjectURL: () => {} });
      let resolve!: (url: string) => void;
      const onUpload = vi.fn(() => new Promise<string>((r) => (resolve = r)));
      const onSave = vi.fn();
      const { editor, container } = await mount({ onUpload, onSave });
      act(() => {
         editor.commands.uploadImages([png()]);
      });
      await waitFor(() => expect(onUpload).toHaveBeenCalled());
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });
      act(() => {
         fireEvent.blur(container.querySelector('.ProseMirror')!);
      });
      expect(onSave.mock.calls.filter(([d]) => hasPlaceholder(d))).toEqual([]);

      await act(async () => resolve('https://cdn.test/uploads/tela.png'));
      await waitFor(() =>
         expect(JSON.stringify(onSave.mock.calls.at(-1)?.[0])).toContain(
            'https://cdn.test/uploads/tela.png'
         )
      );
      expect(onSave.mock.calls.filter(([d]) => hasPlaceholder(d))).toEqual([]);
   });

   it('sair durante o upload: espera terminar e salva o doc com a URL final', async () => {
      Object.assign(URL, { createObjectURL: () => 'blob:placeholder', revokeObjectURL: () => {} });
      let resolve!: (url: string) => void;
      const onUpload = vi.fn(() => new Promise<string>((r) => (resolve = r)));
      const onSave = vi.fn();
      const { editor, unmount } = await mount({ onUpload, onSave, saveDelayMs: 800 });
      act(() => {
         editor.chain().focus('end').insertContent(' texto').run();
         editor.commands.uploadImages([png()]);
      });
      await waitFor(() => expect(onUpload).toHaveBeenCalled());
      unmount();
      expect(onSave.mock.calls.filter(([d]) => hasPlaceholder(d))).toEqual([]);

      await act(async () => resolve('https://cdn.test/uploads/tela.png'));
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const saved = JSON.stringify(onSave.mock.calls.at(-1)![0]);
      expect(saved).toContain('https://cdn.test/uploads/tela.png');
      expect(saved).toContain('texto');
      expect(saved).not.toContain('blob:');
   });
});
