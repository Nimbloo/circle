import { describe, expect, it, vi } from 'vitest';
import { convertEmoticonBeforeCaret } from '@/lib/emoticons';
import { textWithEmoticons } from '@/lib/comment-emoticons';
import { usePreferencesStore } from '@/store/preferences-store';

/**
 * "Convert text emoticons into emojis" valia só no editor de blocos; os campos de
 * comentário (textarea) mandavam ":)" cru. Mesma regra do editor: o emoticon logo antes do
 * cursor, no início ou depois de espaço, vira emoji na hora.
 */
describe('emoticon em textarea', () => {
   it('converte o emoticon recém-digitado e reposiciona o cursor', () => {
      expect(convertEmoticonBeforeCaret('Valeu :) ', 9)).toEqual({ value: 'Valeu 🙂 ', caret: 9 });
      expect(convertEmoticonBeforeCaret('<3 ', 3)).toEqual({ value: '❤️ ', caret: 3 });
   });

   it('prefere o emoticon mais longo (":-)" antes de ":)")', () => {
      expect(convertEmoticonBeforeCaret('ok :-) ', 7)?.value).toBe('ok 🙂 ');
   });

   it('não mexe em URL, no meio de palavra nem longe do cursor', () => {
      expect(convertEmoticonBeforeCaret('http://x:D ', 11)).toBeNull();
      // Só converte depois do espaço: ':p' de ':path' não vira emoji no meio da palavra.
      expect(convertEmoticonBeforeCaret(':p', 2)).toBeNull();
      expect(convertEmoticonBeforeCaret(':path ', 6)).toBeNull();
      expect(convertEmoticonBeforeCaret('a:) ', 4)).toBeNull();
      expect(convertEmoticonBeforeCaret('oi :) tudo', 10)).toBeNull();
   });

   it('só olha o que está antes do cursor (edição no meio do texto)', () => {
      expect(convertEmoticonBeforeCaret('oi :) tudo', 6)).toEqual({
         value: 'oi 🙂 tudo',
         caret: 6,
      });
   });

   it('onChange do comentário converte só com a preferência ligada e só ao digitar', () => {
      const change = (value: string, inputType = 'insertText') => ({
         currentTarget: { value, selectionStart: value.length, setSelectionRange: vi.fn() },
         nativeEvent: { inputType } as unknown as Event,
      });
      usePreferencesStore.setState({ convertEmoticons: true });
      expect(textWithEmoticons(change('boa :D '))).toBe('boa 😄 ');
      expect(textWithEmoticons(change('boa :D ', 'insertFromPaste'))).toBe('boa :D ');
      usePreferencesStore.setState({ convertEmoticons: false });
      expect(textWithEmoticons(change('boa :D '))).toBe('boa :D ');
   });
});
