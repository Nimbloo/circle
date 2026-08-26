'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePreferencesStore } from '@/store/preferences-store';
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
   Paperclip,
   Quote,
   SmilePlus,
   Strikethrough,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Slug do usuário: o real (do backend) quando disponível, senão o prefixo do e-mail. */
function slugOf(user: { email: string; slug?: string }): string {
   return (user.slug ?? user.email.split('@')[0]).toLowerCase();
}

/** Emoticons comuns → emoji (pref "Convert text emoticons into emojis"). */
const EMOTICONS: [RegExp, string][] = [
   [/:\)/g, '🙂'],
   [/:-\)/g, '🙂'],
   [/:\(/g, '🙁'],
   [/:-\(/g, '🙁'],
   [/:D/g, '😃'],
   [/;\)/g, '😉'],
   [/:P/g, '😛'],
   [/<3/g, '❤️'],
];
function convertEmoticons(text: string): string {
   return EMOTICONS.reduce((acc, [re, emoji]) => acc.replace(re, emoji), text);
}

/** Detecta o token de menção (@algo) imediatamente antes do caret. */
function mentionTokenAt(text: string, caret: number): { query: string; start: number } | null {
   const upto = text.slice(0, caret);
   const match = upto.match(/@([a-z0-9._-]*)$/i);
   if (!match) return null;
   return { query: match[1].toLowerCase(), start: caret - match[0].length };
}

/**
 * Composer de comentário com autocomplete de @menção: ao digitar "@" sugere
 * membros do workspace (por nome/slug); selecionar insere "@slug". Posta via
 * api.issues.addComment e chama onPosted (o pai refetch o feed).
 */
export function CommentComposer({ issueId, onPosted }: { issueId: string; onPosted: () => void }) {
   const users = useWorkspaceStore((s) => s.users);
   // "Send comments on..." (Preferences): 'Enter' envia com Enter puro; senão só ⌘/Ctrl+Enter.
   const sendOnEnter = usePreferencesStore((s) => s.sendCommentsOn) === 'Enter';
   const emoticonsOn = usePreferencesStore((s) => s.convertEmoticons);
   const [draft, setDraft] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
   const [active, setActive] = useState(0);
   const [picking, setPicking] = useState(false);
   const [uploading, setUploading] = useState(false);
   const ref = useRef<HTMLTextAreaElement>(null);
   const fileRef = useRef<HTMLInputElement>(null);
   const emojiRef = useRef<HTMLDivElement>(null);
   const customEmojis = useCustomEmojis();

   // Fecha o emoji picker ao clicar fora.
   useEffect(() => {
      if (!picking) return;
      const onDown = (e: MouseEvent) => {
         if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setPicking(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
   }, [picking]);

   const suggestions = useMemo(() => {
      if (!mention) return [];
      const q = mention.query;
      return users
         .filter((u) => u.name.toLowerCase().includes(q) || slugOf(u).includes(q))
         .slice(0, 6);
   }, [mention, users]);

   const sync = (value: string) => {
      setDraft(value);
      const caret = ref.current?.selectionStart ?? value.length;
      setMention(mentionTokenAt(value, caret));
      setActive(0);
   };

   const insertMention = (slug: string) => {
      if (!mention) return;
      const el = ref.current;
      const caret = el?.selectionStart ?? draft.length;
      const before = draft.slice(0, mention.start);
      const after = draft.slice(caret);
      const inserted = `@${slug} `;
      const next = before + inserted + after;
      setDraft(next);
      setMention(null);
      requestAnimationFrame(() => {
         if (el) {
            const pos = before.length + inserted.length;
            el.focus();
            el.setSelectionRange(pos, pos);
         }
      });
   };

   /** Envolve a seleção do textarea com markdown (bold/italic/strike/code/link). */
   const applyWrap = (before: string, after: string, placeholder: string) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart ?? draft.length;
      const end = el.selectionEnd ?? start;
      const selected = draft.slice(start, end) || placeholder;
      const next = draft.slice(0, start) + before + selected + after + draft.slice(end);
      setDraft(next);
      requestAnimationFrame(() => {
         el.focus();
         const s = start + before.length;
         el.setSelectionRange(s, s + selected.length);
      });
   };

   /** Prefixa a linha atual com markdown de bloco (quote, lista, checklist). */
   const applyLinePrefix = (prefix: string) => {
      const el = ref.current;
      const caret = el?.selectionStart ?? draft.length;
      const lineStart = draft.lastIndexOf('\n', caret - 1) + 1;
      const next = draft.slice(0, lineStart) + prefix + draft.slice(lineStart);
      setDraft(next);
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
      const el = ref.current;
      const start = el?.selectionStart ?? draft.length;
      const end = el?.selectionEnd ?? start;
      const selected = draft.slice(start, end) || 'code';
      const next = draft.slice(0, start) + '```\n' + selected + '\n```' + draft.slice(end);
      setDraft(next);
      requestAnimationFrame(() => el?.focus());
   };

   /** Insere texto na posição do caret (emoji, link de anexo). */
   const insertAtCaret = (text: string) => {
      const el = ref.current;
      const start = el?.selectionStart ?? draft.length;
      const end = el?.selectionEnd ?? start;
      const next = draft.slice(0, start) + text + draft.slice(end);
      setDraft(next);
      requestAnimationFrame(() => {
         if (el) {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
         }
      });
   };

   const readAsDataUrl = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
         const fr = new FileReader();
         fr.onload = () => resolve(String(fr.result));
         fr.onerror = () => reject(fr.error);
         fr.readAsDataURL(file);
      });

   // Anexa um arquivo à issue e insere um link markdown no comentário (imagem = ![],
   // demais = []). Reusa o endpoint de anexos da issue (backend real).
   const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || uploading) return;
      if (file.size > 5 * 1024 * 1024) {
         toast.error('Arquivo excede 5MB');
         return;
      }
      setUploading(true);
      try {
         const dataUrl = await readAsDataUrl(file);
         const att = await api.issues.addAttachment(issueId, {
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            dataUrl,
         });
         const md = file.type.startsWith('image/')
            ? `![${att.name}](${att.url})`
            : `[${att.name}](${att.url})`;
         insertAtCaret(md);
      } catch {
         toast.error('Falha ao anexar o arquivo');
      } finally {
         setUploading(false);
      }
   };

   const submit = async () => {
      const text = (emoticonsOn ? convertEmoticons(draft) : draft).trim();
      if (!text || submitting) return;
      setSubmitting(true);
      try {
         await api.issues.addComment(issueId, text);
         setDraft('');
         setMention(null);
         onPosted();
      } catch {
         toast.error('Could not post the comment');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="mt-3 rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-2 relative">
         {mention && suggestions.length > 0 && (
            <div className="absolute bottom-full left-3 mb-1 w-64 max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-lg z-20 py-1">
               {suggestions.map((user, index) => (
                  <button
                     key={user.id}
                     type="button"
                     onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(slugOf(user));
                     }}
                     className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left',
                        index === active ? 'bg-accent' : 'hover:bg-accent/60'
                     )}
                  >
                     <Avatar className="size-5">
                        <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                        <AvatarFallback className="text-[9px]">{user.name[0]}</AvatarFallback>
                     </Avatar>
                     <span className="truncate">{user.name}</span>
                     <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        @{slugOf(user)}
                     </span>
                  </button>
               ))}
            </div>
         )}
         <textarea
            ref={ref}
            value={draft}
            onChange={(event) => sync(event.target.value)}
            onKeyDown={(event) => {
               if (mention && suggestions.length > 0) {
                  if (event.key === 'ArrowDown') {
                     event.preventDefault();
                     setActive((a) => (a + 1) % suggestions.length);
                     return;
                  }
                  if (event.key === 'ArrowUp') {
                     event.preventDefault();
                     setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
                     return;
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                     event.preventDefault();
                     insertMention(slugOf(suggestions[active]));
                     return;
                  }
                  if (event.key === 'Escape') {
                     event.preventDefault();
                     setMention(null);
                     return;
                  }
               }
               if (event.key === 'Enter') {
                  // ⌘/Ctrl+Enter sempre envia; Enter puro envia só se a pref for 'Enter'
                  // (Shift+Enter é sempre quebra de linha).
                  if (event.metaKey || event.ctrlKey) {
                     event.preventDefault();
                     void submit();
                  } else if (sendOnEnter && !event.shiftKey) {
                     event.preventDefault();
                     void submit();
                  }
               }
            }}
            placeholder="Leave a comment... (@ to mention)"
            rows={2}
            disabled={submitting}
            className="w-full resize-none bg-transparent outline-none text-[15px] placeholder:text-muted-foreground disabled:opacity-60"
         />
         <div className="flex items-center justify-between">
            {/* Toolbar de formatação (markdown inline): bold/italic/strike/code/link */}
            <div className="flex items-center gap-0.5 text-muted-foreground">
               <button
                  type="button"
                  title="Bold (⌘B)"
                  aria-label="Bold"
                  onClick={() => applyWrap('**', '**', 'bold')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <Bold className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Italic (⌘I)"
                  aria-label="Italic"
                  onClick={() => applyWrap('*', '*', 'italic')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <Italic className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Strikethrough"
                  aria-label="Strikethrough"
                  onClick={() => applyWrap('~~', '~~', 'strikethrough')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <Strikethrough className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Inline code"
                  aria-label="Inline code"
                  onClick={() => applyWrap('`', '`', 'code')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <Code className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Link"
                  aria-label="Link"
                  onClick={() => applyWrap('[', '](url)', 'text')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <Link2 className="size-3.5" />
               </button>

               <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

               <button
                  type="button"
                  title="Quote"
                  aria-label="Quote"
                  onClick={() => applyLinePrefix('> ')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <Quote className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Code block"
                  aria-label="Code block"
                  onClick={applyCodeBlock}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <FileCode className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Bulleted list"
                  aria-label="Bulleted list"
                  onClick={() => applyLinePrefix('- ')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <List className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Numbered list"
                  aria-label="Numbered list"
                  onClick={() => applyLinePrefix('1. ')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <ListOrdered className="size-3.5" />
               </button>
               <button
                  type="button"
                  title="Checklist"
                  aria-label="Checklist"
                  onClick={() => applyLinePrefix('- [ ] ')}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
               >
                  <ListChecks className="size-3.5" />
               </button>

               <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

               {/* Emoji picker (insere o caractere no texto) */}
               <div className="relative" ref={emojiRef}>
                  <button
                     type="button"
                     title="Emoji"
                     aria-label="Emoji"
                     onClick={() => setPicking((v) => !v)}
                     className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground"
                  >
                     <SmilePlus className="size-3.5" />
                  </button>
                  {picking && (
                     <div className="absolute bottom-full left-0 mb-1 flex items-center flex-wrap gap-1 rounded-lg border bg-popover px-2 py-1.5 shadow-lg z-30 w-52">
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

               {/* Anexar arquivo (upload → link markdown no comentário) */}
               <button
                  type="button"
                  title="Attach file"
                  aria-label="Attach file"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center justify-center size-6 rounded hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
               >
                  <Paperclip className="size-3.5" />
               </button>
               <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => void onFilePicked(e)}
                  accept="image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.zip"
               />
            </div>
            <Button size="xs" onClick={() => void submit()} disabled={!draft.trim() || submitting}>
               {submitting ? 'Posting…' : 'Comment'}
            </Button>
         </div>
      </div>
   );
}
