/**
 * Emoticons de texto → emoji (preferência "Convert text emoticons into emojis"). Módulo
 * puro: o editor de blocos (`editor-emoticons.ts`) e os campos de comentário (textarea)
 * usam o mesmo mapa e a mesma regra.
 */
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
// Mais longos primeiro (":-)" antes de ":)"); só no início ou após espaço, e só quando o
// espaço DEPOIS dele é digitado — senão ":path" viraria "😛ath" no meio da palavra, e
// "http://x:D" também não converte. Grupo 1 = emoticon, grupo 2 = o espaço digitado —
// só espaço LITERAL: com `\s`, o Enter (que o tiptap também passa pelas input rules como
// "\n") virava "emoji + quebra" dentro do parágrafo e não criava o parágrafo novo.
export const EMOTICON_BEFORE_CARET = new RegExp(
   `(?:^|\\s)(${Object.keys(EMOTICONS)
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|')})( )$`
);

/**
 * Converte o emoticon logo antes do espaço recém-digitado (no início ou após espaço). Devolve o texto novo e o cursor ajustado, ou null se não há o
 * que converter.
 */
export function convertEmoticonBeforeCaret(
   value: string,
   caret: number
): { value: string; caret: number } | null {
   const before = value.slice(0, caret);
   const match = before.match(EMOTICON_BEFORE_CARET);
   if (!match) return null;
   const [, emoticon, space] = match;
   const emoji = EMOTICONS[emoticon] + space;
   const start = caret - emoticon.length - space.length;
   const next = value.slice(0, start) + emoji + value.slice(caret);
   return { value: next, caret: start + emoji.length };
}
