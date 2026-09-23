import { Extension, InputRule } from '@tiptap/core';

/** Emoticon de texto → emoji (preferência "Convert text emoticons into emojis"). */
export const EMOTICONS: Readonly<Record<string, string>> = {
   ':)': '🙂',
   ':-)': '🙂',
   ':(': '🙁',
   ':-(': '🙁',
   ':D': '😄',
   ':-D': '😄',
   ';)': '😉',
   ';-)': '😉',
   ':P': '😛',
   ':-P': '😛',
   ':p': '😛',
   ':-p': '😛',
   ':O': '😮',
   ':-O': '😮',
   ':o': '😮',
   ":'(": '😢',
   '<3': '❤️',
   '</3': '💔',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Mais longos primeiro (":-)" antes de ":)"); só no início do bloco ou após espaço, para
// não mexer em URLs/código ("http://x:D" continua intacto).
const FIND = new RegExp(
   `(?:^|\\s)(${Object.keys(EMOTICONS)
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|')})$`
);

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
               // `range` cobre o trecho JÁ no doc (o último caractere ainda não entrou);
               // pula o espaço inicial do match para trocar só o emoticon.
               const emoticon = match[1];
               const from = range.from + match[0].lastIndexOf(emoticon);
               state.tr.insertText(EMOTICONS[emoticon], from, range.to);
            },
         }),
      ];
   },
});
