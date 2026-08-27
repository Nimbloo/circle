'use client';

import { useCustomEmojis } from '@/hooks/use-custom-emojis';
import {
   Bold,
   Code,
   FileCode,
   Italic,
   Link2,
   List,
   ListChecks,
   ListOrdered,
   Quote,
   SmilePlus,
   Strikethrough,
} from 'lucide-react';
import { RefObject, useEffect, useRef, useState } from 'react';

/**
 * Toolbar de formatação markdown reutilizável — opera sobre um `<textarea>` via
 * ref + value/onChange. Os mesmos botões e a mesma sintaxe do composer de
 * comentário (bold/italic/strike/inline-code/link/quote/code-block/listas/
 * checklist/emoji), pra que o editor de documento e o composer fiquem idênticos.
 * Não inclui @menção nem anexo (específicos do composer).
 */
export function MarkdownToolbar({
   textareaRef,
   value,
   onChange,
}: {
   textareaRef: RefObject<HTMLTextAreaElement | null>;
   value: string;
   onChange: (next: string) => void;
}) {
   const [picking, setPicking] = useState(false);
   const emojiRef = useRef<HTMLDivElement>(null);
   const customEmojis = useCustomEmojis();

   useEffect(() => {
      if (!picking) return;
      const onDown = (e: MouseEvent) => {
         if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setPicking(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
   }, [picking]);

   /** Envolve a seleção com markdown inline (bold/italic/strike/code/link). */
   const applyWrap = (before: string, after: string, placeholder: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      const selected = value.slice(start, end) || placeholder;
      const next = value.slice(0, start) + before + selected + after + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
         el.focus();
         const s = start + before.length;
         el.setSelectionRange(s, s + selected.length);
      });
   };

   /** Prefixa a linha atual com markdown de bloco (quote, lista, checklist). */
   const applyLinePrefix = (prefix: string) => {
      const el = textareaRef.current;
      const caret = el?.selectionStart ?? value.length;
      const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
      const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      onChange(next);
      requestAnimationFrame(() => {
         if (el) {
            el.focus();
            const pos = caret + prefix.length;
            el.setSelectionRange(pos, pos);
         }
      });
   };

   /** Bloco de código (envolve a seleção com ``` em linhas próprias). */
   const applyCodeBlock = () => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      const selected = value.slice(start, end) || 'code';
      const next = value.slice(0, start) + '```\n' + selected + '\n```' + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => el?.focus());
   };

   /** Insere texto na posição do caret (emoji). */
   const insertAtCaret = (text: string) => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      const next = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
         if (el) {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
         }
      });
   };

   const btn = 'inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground';

   return (
      <div className="flex items-center gap-0.5 text-muted-foreground">
         <button type="button" title="Bold (⌘B)" aria-label="Bold" onClick={() => applyWrap('**', '**', 'bold')} className={btn}>
            <Bold className="size-3.5" />
         </button>
         <button type="button" title="Italic (⌘I)" aria-label="Italic" onClick={() => applyWrap('*', '*', 'italic')} className={btn}>
            <Italic className="size-3.5" />
         </button>
         <button type="button" title="Strikethrough" aria-label="Strikethrough" onClick={() => applyWrap('~~', '~~', 'strikethrough')} className={btn}>
            <Strikethrough className="size-3.5" />
         </button>
         <button type="button" title="Inline code" aria-label="Inline code" onClick={() => applyWrap('`', '`', 'code')} className={btn}>
            <Code className="size-3.5" />
         </button>
         <button type="button" title="Link" aria-label="Link" onClick={() => applyWrap('[', '](url)', 'text')} className={btn}>
            <Link2 className="size-3.5" />
         </button>

         <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

         <button type="button" title="Quote" aria-label="Quote" onClick={() => applyLinePrefix('> ')} className={btn}>
            <Quote className="size-3.5" />
         </button>
         <button type="button" title="Code block" aria-label="Code block" onClick={applyCodeBlock} className={btn}>
            <FileCode className="size-3.5" />
         </button>
         <button type="button" title="Bulleted list" aria-label="Bulleted list" onClick={() => applyLinePrefix('- ')} className={btn}>
            <List className="size-3.5" />
         </button>
         <button type="button" title="Numbered list" aria-label="Numbered list" onClick={() => applyLinePrefix('1. ')} className={btn}>
            <ListOrdered className="size-3.5" />
         </button>
         <button type="button" title="Checklist" aria-label="Checklist" onClick={() => applyLinePrefix('- [ ] ')} className={btn}>
            <ListChecks className="size-3.5" />
         </button>

         <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

         <div className="relative" ref={emojiRef}>
            <button type="button" title="Emoji" aria-label="Emoji" onClick={() => setPicking((v) => !v)} className={btn}>
               <SmilePlus className="size-3.5" />
            </button>
            {picking && (
               <div className="absolute top-full left-0 mt-1 flex items-center flex-wrap gap-1 rounded-lg border bg-popover px-2 py-1.5 shadow-lg z-30 w-52">
                  {['👍', '❤️', '🎉', '🚀', '👀', '🎯', '🙂', '🔥', '✅', '🙏'].map((em) => (
                     <button
                        key={em}
                        type="button"
                        onClick={() => {
                           insertAtCaret(em);
                           setPicking(false);
                        }}
                        className="text-base transition-transform hover:scale-125"
                     >
                        {em}
                     </button>
                  ))}
                  {customEmojis.map((ce) => (
                     <button
                        key={ce.id}
                        type="button"
                        title={`:${ce.shortcode}:`}
                        onClick={() => {
                           insertAtCaret(`:${ce.shortcode}:`);
                           setPicking(false);
                        }}
                        className="transition-transform hover:scale-125"
                     >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ce.url} alt={ce.shortcode} className="size-4 object-contain" />
                     </button>
                  ))}
               </div>
            )}
         </div>
      </div>
   );
}
