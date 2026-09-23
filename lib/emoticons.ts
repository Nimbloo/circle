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
// Mais longos primeiro (":-)" antes de ":)"); só no início do bloco ou após espaço, para
// não mexer em URLs/código ("http://x:D" continua intacto).
export const EMOTICON_BEFORE_CARET = new RegExp(
   `(?:^|\\s)(${Object.keys(EMOTICONS)
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|')})$`
);

/**
 * Converte o emoticon imediatamente antes do cursor (no início ou após espaço) — o que
 * acabou de ser digitado. Devolve o texto novo e o cursor ajustado, ou null se não há o
 * que converter.
 */
export function convertEmoticonBeforeCaret(
   value: string,
   caret: number
): { value: string; caret: number } | null {
   const before = value.slice(0, caret);
   const match = before.match(EMOTICON_BEFORE_CARET);
   if (!match) return null;
   const emoticon = match[1];
   const emoji = EMOTICONS[emoticon];
   const start = caret - emoticon.length;
   const next = value.slice(0, start) + emoji + value.slice(caret);
   return { value: next, caret: start + emoji.length };
}
