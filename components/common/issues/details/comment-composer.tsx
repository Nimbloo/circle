'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Slug do usuário: o real (do backend) quando disponível, senão o prefixo do e-mail. */
function slugOf(user: { email: string; slug?: string }): string {
   return (user.slug ?? user.email.split('@')[0]).toLowerCase();
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
   const [draft, setDraft] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
   const [active, setActive] = useState(0);
   const ref = useRef<HTMLTextAreaElement>(null);

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

   const submit = async () => {
      const text = draft.trim();
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
               if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  void submit();
               }
            }}
            placeholder="Leave a comment... (@ to mention)"
            rows={2}
            disabled={submitting}
            className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:opacity-60"
         />
         <div className="flex items-center justify-between">
            <Plus className="size-4 text-muted-foreground" />
            <Button size="xs" onClick={() => void submit()} disabled={!draft.trim() || submitting}>
               {submitting ? 'Posting…' : 'Comment'}
            </Button>
         </div>
      </div>
   );
}
