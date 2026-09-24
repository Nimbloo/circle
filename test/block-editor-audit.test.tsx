// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';
import { EDITOR_IMAGE_MAX_BYTES } from '@/lib/editor-image';
import { MAX_UPLOAD_BYTES } from '@/lib/api/uploads';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));
const toastMocks = vi.hoisted(() => ({
   success: vi.fn(),
   error: vi.fn(),
   warning: vi.fn(),
   info: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMocks }));

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

describe('BlockEditor — placeholder órfão (CodeRabbit #190)', () => {
   const png = () => new File(['x'], 'tela.png', { type: 'image/png' });

   it('undo depois do upload volta o placeholder blob:, mas não trava o autosave', async () => {
      Object.assign(URL, { createObjectURL: () => 'blob:orfao', revokeObjectURL: () => {} });
      let resolve!: (url: string) => void;
      const onUpload = vi.fn(() => new Promise<string>((r) => (resolve = r)));
      const onSave = vi.fn();
      const { editor, container } = await mount({ onUpload, onSave });
      act(() => {
         editor.commands.uploadImages([png()]);
      });
      await waitFor(() => expect(onUpload).toHaveBeenCalled());
      // Upload mais longo que a janela de agrupamento do histórico: a troca pela URL
      // final vira um passo de undo próprio.
      await act(async () => {
         await new Promise((r) => setTimeout(r, 600));
      });
      await act(async () => resolve('https://cdn.test/uploads/tela.png'));
      await waitFor(() =>
         expect(JSON.stringify(editor.getJSON())).toContain('https://cdn.test/uploads/tela.png')
      );
      act(() => {
         editor.commands.undo();
      });
      // Premissa: o undo devolveu o placeholder, que não está mais em upload.
      expect(JSON.stringify(editor.getJSON())).toContain('blob:orfao');
      onSave.mockClear();

      act(() => {
         editor.chain().focus('end').insertContent(' novo').run();
         fireEvent.blur(container.querySelector('.ProseMirror')!);
      });
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const saved = JSON.stringify(onSave.mock.calls.at(-1)![0]);
      expect(saved).toContain('novo');
      expect(saved).not.toContain('blob:');
      // A imagem que já tinha subido não se perde: o órfão volta à URL final.
      expect(saved).toContain('https://cdn.test/uploads/tela.png');
   });

   it('sair com placeholder órfão no doc também salva (sem esperar upload inexistente)', async () => {
      Object.assign(URL, { createObjectURL: () => 'blob:orfao2', revokeObjectURL: () => {} });
      let resolve!: (url: string) => void;
      const onUpload = vi.fn(() => new Promise<string>((r) => (resolve = r)));
      const onSave = vi.fn();
      const { editor, unmount } = await mount({ onUpload, onSave, saveDelayMs: 800 });
      act(() => {
         editor.commands.uploadImages([png()]);
      });
      await waitFor(() => expect(onUpload).toHaveBeenCalled());
      // Upload mais longo que a janela de agrupamento do histórico: a troca pela URL
      // final vira um passo de undo próprio.
      await act(async () => {
         await new Promise((r) => setTimeout(r, 600));
      });
      await act(async () => resolve('https://cdn.test/uploads/b.png'));
      await waitFor(() =>
         expect(JSON.stringify(editor.getJSON())).toContain('https://cdn.test/uploads/b.png')
      );
      act(() => {
         editor.commands.undo();
      });
      expect(JSON.stringify(editor.getJSON())).toContain('blob:orfao2');
      act(() => {
         editor.chain().focus('end').insertContent(' fim').run();
      });
      onSave.mockClear();
      unmount();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const saved = JSON.stringify(onSave.mock.calls.at(-1)![0]);
      expect(saved).toContain('fim');
      expect(saved).not.toContain('blob:');
      expect(saved).toContain('https://cdn.test/uploads/b.png');
   });
});

describe('BlockEditor — pré-validação do upload de imagem', () => {
   it('tipo que o servidor recusa (svg/heic) não sobe nem vira placeholder; avisa', async () => {
      const onUpload = vi.fn(async () => 'https://cdn.test/x.png');
      const { editor } = await mount({ onUpload });
      toastMocks.error.mockClear();
      act(() => {
         editor.commands.uploadImages([
            new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
            new File(['x'], 'foto.heic', { type: 'image/heic' }),
         ]);
      });
      await act(async () => {
         await new Promise((r) => setTimeout(r, 10));
      });
      expect(onUpload).not.toHaveBeenCalled();
      expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"image"');
      expect(toastMocks.error).toHaveBeenCalledTimes(2);
      expect(String(toastMocks.error.mock.calls[0][0])).toMatch(/PNG, JPEG, WebP ou GIF/);
   });

   it('arquivo acima do limite do servidor não é lido nem enviado; avisa', async () => {
      const onUpload = vi.fn(async () => 'https://cdn.test/x.png');
      const { editor } = await mount({ onUpload });
      toastMocks.error.mockClear();
      const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'grande.png', {
         type: 'image/png',
      });
      act(() => {
         editor.commands.uploadImages([big]);
      });
      await act(async () => {
         await new Promise((r) => setTimeout(r, 10));
      });
      expect(onUpload).not.toHaveBeenCalled();
      expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"image"');
      expect(String(toastMocks.error.mock.calls[0][0])).toMatch(/5 MB/);
   });

   it('limites do cliente batem com os do servidor', () => {
      expect(EDITOR_IMAGE_MAX_BYTES).toBe(MAX_UPLOAD_BYTES);
   });
});

describe('BlockEditor — imagem externa colada', () => {
   it('descarta <img> de terceiro (CSP bloqueia) e avisa; mantém CDN e data:', async () => {
      vi.stubEnv('NEXT_PUBLIC_CIRCLE_CDN_URL', 'https://cdn.test');
      try {
         const { editor } = await mount({ doc: paragraph('') });
         toastMocks.warning.mockClear();
         act(() => {
            editor.commands.focus('end');
            editor.view.pasteHTML(
               '<p>texto</p><img src="https://terceiro.example/x.png">' +
                  '<img src="https://cdn.test/uploads/ok.png">',
               new ClipboardEvent('paste')
            );
         });
         const json = JSON.stringify(editor.getJSON());
         expect(json).toContain('texto');
         expect(json).toContain('https://cdn.test/uploads/ok.png');
         expect(json).not.toContain('terceiro.example');
         expect(toastMocks.warning).toHaveBeenCalledTimes(1);
      } finally {
         vi.unstubAllEnvs();
      }
   });
});

describe('BlockEditor — links', () => {
   const LINKED: EditorDoc = {
      type: 'doc',
      content: [
         {
            type: 'paragraph',
            content: [
               {
                  type: 'text',
                  text: 'site',
                  marks: [{ type: 'link', attrs: { href: 'https://linear.app/docs' } }],
               },
            ],
         },
      ],
   };

   it('Ctrl/Cmd+clique e botão do meio abrem o link em nova aba (noopener); clique simples não', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      try {
         const { container } = await mount({ doc: LINKED });
         const a = container.querySelector('.ProseMirror a[href]')!;
         expect(a).not.toBeNull();

         fireEvent.click(a);
         expect(open).not.toHaveBeenCalled();

         fireEvent.click(a, { ctrlKey: true });
         expect(open).toHaveBeenLastCalledWith(
            'https://linear.app/docs',
            '_blank',
            expect.stringContaining('noopener')
         );
         fireEvent.click(a, { metaKey: true });
         expect(open).toHaveBeenCalledTimes(2);

         fireEvent(a, new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
         expect(open).toHaveBeenCalledTimes(3);
      } finally {
         open.mockRestore();
      }
   });
});

describe('BlockEditor — acessibilidade', () => {
   it('o editor tem nome acessível (do placeholder) e é multilinha', async () => {
      const { container } = await mount({ placeholder: 'Add a description…' });
      const root = container.querySelector('.ProseMirror')!;
      expect(root.getAttribute('role')).toBe('textbox');
      expect(root.getAttribute('aria-label')).toBe('Add a description');
      expect(root.getAttribute('aria-multiline')).toBe('true');
   });

   it('menu "/" ligado ao editor: expanded/controls/activedescendant; opções fora do Tab', async () => {
      const { editor, container } = await mount({ doc: paragraph('') });
      const root = container.querySelector('.ProseMirror')!;
      expect(root.getAttribute('aria-expanded')).toBe('false');
      act(() => {
         editor.chain().focus('end').insertContent('/').run();
      });
      const menu = await waitFor(() => {
         const el = document.querySelector('[role="listbox"][aria-label="Insert block"]');
         expect(el).not.toBeNull();
         return el!;
      });
      const options = Array.from(menu.querySelectorAll('[role="option"]'));
      expect(options.length).toBeGreaterThan(1);
      options.forEach((o) => expect(o.getAttribute('tabindex')).toBe('-1'));
      await waitFor(() => expect(root.getAttribute('aria-expanded')).toBe('true'));
      expect(root.getAttribute('aria-controls')).toBe(menu.id);
      expect(menu.id).toBeTruthy();
      expect(root.getAttribute('aria-activedescendant')).toBe(options[0].id);

      act(() => {
         fireEvent.keyDown(root, { key: 'ArrowDown' });
      });
      await waitFor(() => expect(root.getAttribute('aria-activedescendant')).toBe(options[1].id));

      act(() => {
         fireEvent.keyDown(root, { key: 'Escape' });
      });
      await waitFor(() => expect(root.getAttribute('aria-expanded')).toBe('false'));
      expect(root.hasAttribute('aria-activedescendant')).toBe(false);
   });
});

describe('BlockEditor — opções depois de montar', () => {
   it('placeholder que muda depois de montar aparece no editor', async () => {
      const { container, rerender } = await mount({ doc: paragraph(''), placeholder: 'Primeiro…' });
      const root = container.querySelector('.ProseMirror')!;
      await waitFor(() =>
         expect(root.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')).toBe(
            'Primeiro…'
         )
      );
      rerender(<BlockEditor doc={paragraph('')} saveDelayMs={0} placeholder="Segundo…" />);
      await waitFor(() =>
         expect(root.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')).toBe(
            'Segundo…'
         )
      );
      expect(root.getAttribute('aria-label')).toBe('Segundo');
   });
});
