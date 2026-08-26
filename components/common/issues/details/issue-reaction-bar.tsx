'use client';

import { cn } from '@/lib/utils';
import { api } from '@/lib/client';
import { useCustomEmojis, customEmojiUrl } from '@/hooks/use-custom-emojis';
import { SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Reaction {
   emoji: string;
   count: number;
   reactedByMe: boolean;
}

/**
 * Barra de reactions a nível de ISSUE (o "Add reaction" abaixo da descrição, estilo
 * Linear). Mesma UX/experiência das reactions de comentário (pills + picker com emojis
 * base + custom emojis). Backend real (`issue_reaction`); `onChanged` refaz o detail.
 */
export function IssueReactionBar({
   issueId,
   reactions,
   onChanged,
}: {
   issueId: string;
   reactions: Reaction[];
   onChanged: () => void;
}) {
   const [busy, setBusy] = useState(false);
   const [picking, setPicking] = useState(false);
   const customEmojis = useCustomEmojis();
   const rootRef = useRef<HTMLDivElement>(null);

   // Fecha o picker ao clicar fora (o Linear também fecha).
   useEffect(() => {
      if (!picking) return;
      const onDown = (e: MouseEvent) => {
         if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPicking(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
   }, [picking]);

   const didReact = (emoji: string) =>
      reactions.find((r) => r.emoji === emoji)?.reactedByMe ?? false;

   const react = async (emoji: string) => {
      if (busy) return;
      const reacted = didReact(emoji);
      setBusy(true);
      try {
         if (reacted) await api.issues.removeReaction(issueId, emoji);
         else await api.issues.addReaction(issueId, emoji);
         setPicking(false);
         onChanged();
      } catch {
         toast.error(reacted ? 'Could not remove the reaction' : 'Could not add the reaction');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div ref={rootRef} className="flex items-center flex-wrap gap-1.5">
         {reactions.map((reaction) => (
            <button
               key={reaction.emoji}
               type="button"
               onClick={() => void react(reaction.emoji)}
               disabled={busy}
               aria-pressed={reaction.reactedByMe}
               className={cn(
                  'inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 disabled:opacity-40',
                  reaction.reactedByMe
                     ? 'bg-primary/15 border-primary/40 hover:bg-primary/20'
                     : 'bg-accent/60 border-border/60 hover:bg-accent'
               )}
            >
               {(() => {
                  const url = customEmojiUrl(reaction.emoji);
                  return url ? (
                     // eslint-disable-next-line @next/next/no-img-element
                     <img src={url} alt={reaction.emoji} className="size-4 object-contain" />
                  ) : (
                     <span>{reaction.emoji}</span>
                  );
               })()}{' '}
               {reaction.count}
            </button>
         ))}
         <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            disabled={busy}
            aria-label="Add reaction"
            className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-40"
         >
            <SmilePlus className="size-4" />
         </button>
         {picking && (
            <div className="flex items-center flex-wrap gap-1 rounded-full border bg-container px-1.5 py-0.5 shadow-xs max-w-[220px]">
               {['👍', '❤️', '🎉', '🚀', '👀', '🎯'].map((emoji) => (
                  <button
                     key={emoji}
                     type="button"
                     onClick={() => void react(emoji)}
                     disabled={busy}
                     className="text-sm transition-transform hover:scale-125 disabled:opacity-40"
                  >
                     {emoji}
                  </button>
               ))}
               {customEmojis.map((e) => (
                  <button
                     key={e.id}
                     type="button"
                     onClick={() => void react(`:${e.shortcode}:`)}
                     disabled={busy}
                     title={`:${e.shortcode}:`}
                     className="transition-transform hover:scale-125 disabled:opacity-40"
                  >
                     {/* eslint-disable-next-line @next/next/no-img-element */}
                     <img src={e.url} alt={e.shortcode} className="size-4 object-contain" />
                  </button>
               ))}
            </div>
         )}
      </div>
   );
}
