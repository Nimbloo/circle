// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

const ISSUES = [
   { id: 'i1', identifier: 'ENG-1', title: 'Login quebrado' },
   { id: 'i2', identifier: 'ENG-2', title: 'Tela de billing' },
   { id: 'i3', identifier: 'OPS-7', title: 'Rotação de chaves' },
].map(
   (i): Issue => ({
      ...i,
      description: '',
      status: status[0],
      priority: priorities[0],
      assignee: null,
      assignees: [],
      labels: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      cycleId: '',
      rank: 'a',
   })
);

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

   it('vídeo: YouTube vira iframe; .mp4 vira <video controls>; URL comum é recusada', async () => {
      const { editor, container } = await mount();
      const root = container.querySelector('.ProseMirror')!;
      act(() => {
         editor
            .chain()
            .focus('end')
            .setVideo({ src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
            .run();
      });
      const iframe = root.querySelector('div[data-type="video"][data-provider="youtube"] iframe')!;
      expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(iframe.hasAttribute('allowfullscreen')).toBe(true);

      act(() => {
         editor.chain().focus('end').setVideo({ src: 'https://cdn.test/demo.mp4' }).run();
      });
      const video = root.querySelector('div[data-type="video"][data-provider="file"] video')!;
      expect(video.getAttribute('src')).toBe('https://cdn.test/demo.mp4');
      expect(video.hasAttribute('controls')).toBe(true);

      expect(editor.commands.setVideo({ src: 'https://example.com/page' })).toBe(false);
      const json = JSON.stringify(editor.getJSON());
      expect(json).toContain('"provider":"youtube"');
      expect(json).toContain('"provider":"file"');
   });

   it('referência: "#ENG" lista sugestões do store e selecionar insere o chip issueRef', async () => {
      useIssuesStore.setState({ issues: ISSUES });
      const { editor, container } = await mount({ doc: blocksToDoc([]) });
      act(() => {
         editor.chain().focus('end').insertContent('Ver #ENG').run();
      });
      const menu = await waitFor(() => {
         const el = document.querySelector('[role="listbox"][aria-label="Reference issue"]');
         expect(el).not.toBeNull();
         return el!;
      });
      const options = menu.querySelectorAll('[role="option"]');
      expect(options).toHaveLength(2);
      expect(options[0].textContent).toContain('ENG-1');
      expect(options[0].textContent).toContain('Login quebrado');
      expect(menu.textContent).not.toContain('OPS-7');

      act(() => {
         fireEvent.mouseDown(options[1]);
      });
      const root = container.querySelector('.ProseMirror')!;
      await waitFor(() => {
         const chip = root.querySelector('.issue-ref[data-identifier="ENG-2"]');
         expect(chip).not.toBeNull();
         expect(chip!.textContent).toContain('ENG-2');
         expect(chip!.textContent).toContain('Tela de billing');
         expect(chip!.querySelector('a')?.getAttribute('href')).toBe('/nimbloo/issue/ENG-2');
      });
      expect(document.querySelector('[aria-label="Reference issue"]')).toBeNull();
      const json = JSON.stringify(editor.getJSON());
      expect(json).toContain('{"type":"issueRef","attrs":{"identifier":"ENG-2"}}');
      expect(json).not.toContain('#ENG');
   });

   it('referência: colar "ENG-1" conhecido vira issueRef; identifier desconhecido fica texto', async () => {
      useIssuesStore.setState({ issues: ISSUES });
      const { editor, container } = await mount({ doc: blocksToDoc([]) });
      act(() => {
         editor.commands.focus('end');
         // Colar de verdade (ProseMirror), com o ClipboardEvent do setup-dom.
         editor.view.pasteText('Bloqueado por ENG-1 e UTF-8', new ClipboardEvent('paste'));
      });
      const root = container.querySelector('.ProseMirror')!;
      await waitFor(() =>
         expect(root.querySelector('.issue-ref[data-identifier="ENG-1"]')).not.toBeNull()
      );
      expect(root.querySelector('.issue-ref[data-identifier="UTF-8"]')).toBeNull();
      expect(root.textContent).toContain('UTF-8');
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
