// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';

const DOC: EditorDoc = blocksToDoc([
   { type: 'heading', text: 'Plano', level: 1 },
   { type: 'paragraph', text: 'Um **ponto** e `codigo`' },
   { type: 'checklist', items: [{ text: 'feito', checked: true }] },
]);

/** Monta o editor e espera o Tiptap criar a instância (immediatelyRender: false). */
async function mount(props: Partial<React.ComponentProps<typeof BlockEditor>> = {}) {
   let editor: Editor | null = null;
   const utils = render(
      <BlockEditor doc={DOC} onReady={(e) => (editor = e)} saveDelayMs={0} {...props} />
   );
   await waitFor(() => expect(editor).not.toBeNull());
   return { ...utils, editor: editor as unknown as Editor };
}

describe('BlockEditor #16', () => {
   afterEach(() => vi.useRealTimers());

   it('renderiza o doc (heading, marks, task list)', async () => {
      const { container } = await mount();
      const root = container.querySelector('.ProseMirror')!;
      expect(root.querySelector('h1')?.textContent).toBe('Plano');
      expect(root.querySelector('strong')?.textContent).toBe('ponto');
      expect(root.querySelector('code')?.textContent).toBe('codigo');
      const task = root.querySelector('ul[data-type="taskList"] li');
      expect(task?.getAttribute('data-checked')).toBe('true');
      expect(root.getAttribute('contenteditable')).toBe('true');
   });

   it('digitar chama onChange com o JSON do ProseMirror', async () => {
      const onChange = vi.fn();
      const { editor } = await mount({ onChange });
      act(() => {
         editor.chain().focus('end').insertContent(' novo').run();
      });
      expect(onChange).toHaveBeenCalled();
      const last = onChange.mock.calls.at(-1)![0] as EditorDoc;
      expect(last.type).toBe('doc');
      const text = JSON.stringify(last);
      expect(text).toContain('novo');
      expect(text).toContain('"type":"taskItem"');
   });

   it('onSave é chamado com debounce e faz flush no blur', async () => {
      const onSave = vi.fn();
      // Monta com timers reais (o Tiptap cria o editor de forma assíncrona) e só então
      // congela o relógio para controlar o debounce.
      const { editor, container } = await mount({ onSave, saveDelayMs: 800 });
      vi.useFakeTimers();
      try {
         act(() => {
            editor.chain().focus('end').insertContent('a').run();
         });
         expect(onSave).not.toHaveBeenCalled();
         act(() => {
            vi.advanceTimersByTime(800);
         });
         expect(onSave).toHaveBeenCalledTimes(1);

         act(() => {
            editor.chain().focus('end').insertContent('b').run();
         });
         // jsdom não move o foco de verdade num contenteditable: dispara o blur no DOM.
         act(() => {
            fireEvent.blur(container.querySelector('.ProseMirror')!);
         });
         expect(onSave).toHaveBeenCalledTimes(2);
         expect(JSON.stringify(onSave.mock.calls[1][0])).toContain('"text":"ab"');
      } finally {
         vi.useRealTimers();
      }
   });

   it('editable=false renderiza só leitura, sem placeholder', async () => {
      const { container } = await mount({ editable: false, doc: blocksToDoc([]) });
      const root = container.querySelector('.ProseMirror')!;
      expect(root.getAttribute('contenteditable')).toBe('false');
      expect(root.querySelector('[data-placeholder]')).toBeNull();
   });

   it('imagem: placeholder durante o upload, URL final ao concluir', async () => {
      Object.assign(URL, { createObjectURL: () => 'blob:placeholder', revokeObjectURL: () => {} });
      let resolve!: (url: string) => void;
      const onUpload = vi.fn(() => new Promise<string>((r) => (resolve = r)));
      const { editor, container } = await mount({ onUpload });
      act(() => {
         editor.commands.uploadImages([new File(['x'], 'tela.png', { type: 'image/png' })]);
      });
      const root = container.querySelector('.ProseMirror')!;
      await waitFor(() => expect(root.querySelector('img[data-uploading]')).not.toBeNull());
      expect(onUpload).toHaveBeenCalledTimes(1);
      await act(async () => resolve('https://cdn.test/uploads/tela.png'));
      await waitFor(() => {
         const img = root.querySelector('img')!;
         expect(img.getAttribute('src')).toBe('https://cdn.test/uploads/tela.png');
         expect(img.hasAttribute('data-uploading')).toBe(false);
      });
      expect(JSON.stringify(editor.getJSON())).toContain('"type":"image"');
   });

   it('imagem: erro no upload remove o nó', async () => {
      Object.assign(URL, { createObjectURL: () => 'blob:placeholder', revokeObjectURL: () => {} });
      const onUpload = vi.fn(async () => {
         throw new Error('boom');
      });
      const { editor, container } = await mount({ onUpload });
      act(() => {
         editor.commands.uploadImages([new File(['x'], 'tela.png', { type: 'image/png' })]);
      });
      const root = container.querySelector('.ProseMirror')!;
      await waitFor(() => expect(root.querySelector('img')).toBeNull());
      expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"image"');
   });

   it('doc externo novo substitui o conteúdo quando o editor não tem foco', async () => {
      const { container, rerender } = await mount();
      rerender(
         <BlockEditor doc={blocksToDoc([{ type: 'paragraph', text: 'outro' }])} saveDelayMs={0} />
      );
      await waitFor(() =>
         expect(container.querySelector('.ProseMirror')?.textContent).toBe('outro')
      );
   });
});
