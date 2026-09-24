// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
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
