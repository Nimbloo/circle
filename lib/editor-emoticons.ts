import { Extension, InputRule } from '@tiptap/core';
import { EMOTICONS, EMOTICON_BEFORE_CARET as FIND } from './emoticons';

export interface EmoticonsOptions {
   /** Lido a cada tecla: a preferência pode mudar com o editor aberto. */
   isEnabled: () => boolean;
}

/**
 * Converte emoticons digitados em emoji assim que o último caractere é digitado
 * (input rule: desfazer com ⌘Z volta o texto). Fora de code block/código inline.
 */
export const Emoticons = Extension.create<EmoticonsOptions>({
   name: 'emoticons',
   addOptions() {
      return { isEnabled: () => true };
   },
   addInputRules() {
      return [
         new InputRule({
            find: FIND,
            handler: ({ state, range, match }) => {
               if (!this.options.isEnabled()) return null;
               const $from = state.doc.resolve(range.from);
               if ($from.parent.type.spec.code) return null;
               if (state.schema.marks.code?.isInSet($from.marks())) return null;
               // `range` cobre o trecho JÁ no doc (o espaço digitado ainda não entrou): troca
               // só o emoticon (pulando o espaço inicial do match) e insere o espaço junto.
               const [, emoticon, space] = match;
               const from = range.from + match[0].lastIndexOf(emoticon + space);
               state.tr.insertText(EMOTICONS[emoticon] + space, from, range.to);
            },
         }),
      ];
   },
});
