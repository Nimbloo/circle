// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { usePreferencesStore } from '@/store/preferences-store';

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

async function mount() {
   let editor: Editor | null = null;
   render(<BlockEditor doc={null} onReady={(e) => (editor = e)} saveDelayMs={0} />);
   await waitFor(() => expect(editor).not.toBeNull());
   return editor as unknown as Editor;
}

/** Digita caractere a caractere passando pelo `handleTextInput` (onde vivem as input rules). */
function type(editor: Editor, text: string) {
   for (const ch of text) {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp('handleTextInput', (f) =>
         f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to))
      );
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
   }
}

describe('preferência "Convert text emoticons into emojis"', () => {
   it('ligada: :) :( :D <3 viram emoji', async () => {
      usePreferencesStore.getState().setPref('convertEmoticons', true);
      const editor = await mount();
      editor.commands.focus('end');
      type(editor, 'oi :) tchau :( rs :D amo <3');
      expect(editor.getText()).toBe('oi 🙂 tchau 🙁 rs 😄 amo ❤️');
   });

   it('desligada: o texto fica como digitado', async () => {
      usePreferencesStore.getState().setPref('convertEmoticons', false);
      const editor = await mount();
      editor.commands.focus('end');
      type(editor, 'oi :) <3');
      expect(editor.getText()).toBe('oi :) <3');
   });

   it('não converte colado a outra palavra (ex.: URL)', async () => {
      usePreferencesStore.getState().setPref('convertEmoticons', true);
      const editor = await mount();
      editor.commands.focus('end');
      type(editor, 'http:D');
      expect(editor.getText()).toBe('http:D');
   });
});
