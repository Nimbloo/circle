import { usePreferencesStore } from '@/store/preferences-store';
import { convertEmoticonBeforeCaret } from './emoticons';

interface TextareaChange {
   currentTarget: Pick<HTMLTextAreaElement, 'value' | 'selectionStart' | 'setSelectionRange'>;
   nativeEvent: Event;
}

/**
 * `onChange` de campo de comentário (textarea) com a preferência "Convert text emoticons
 * into emojis": devolve o texto a guardar no estado, com o emoticon recém-digitado já
 * convertido. Só em digitação (colar, apagar e desfazer ficam como estão), e o cursor
 * volta para logo depois do emoji quando o React reescreve o valor.
 */
export function textWithEmoticons(event: TextareaChange): string {
   const el = event.currentTarget;
   const value = el.value;
   if (!usePreferencesStore.getState().convertEmoticons) return value;
   const inputType = (event.nativeEvent as InputEvent).inputType;
   if (inputType && inputType !== 'insertText') return value;
   const converted = convertEmoticonBeforeCaret(value, el.selectionStart ?? value.length);
   if (!converted) return value;
   const place = () => el.setSelectionRange(converted.caret, converted.caret);
   if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
   else setTimeout(place, 0);
   return converted.value;
}
