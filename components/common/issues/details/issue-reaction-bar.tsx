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

/** Aplica o toggle de uma reaction sobre a lista atual (concatena/incrementa ou
 *  remove/decrementa) — a mesma transformação usada de forma otimista e no revert. */
function applyToggle(list: Reaction[], emoji: string): Reaction[] {
   const existing = list.find((r) => r.emoji === emoji);
   if (existing?.reactedByMe) {
      const count = existing.count - 1;
      return count <= 0
         ? list.filter((r) => r.emoji !== emoji)
         : list.map((r) => (r.emoji === emoji ? { ...r, count, reactedByMe: false } : r));
   }
   if (existing) {
      return list.map((r) =>
         r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r
      );
   }
   return [...list, { emoji, count: 1, reactedByMe: true }];
}

/**
 * Barra de reactions a nível de ISSUE (o "Add reaction" abaixo da descrição, estilo
 * Linear). OTIMISTA: o clique atualiza o estado local na hora (concatena/toggle) e o
 * backend (`issue_reaction`) é chamado em segundo plano — sem refetch pesado do detail
 * (que deixava a reação lenta e causava corrida de "replace"). `reactions` (prop) é a
 * verdade do servidor e ressincroniza via live-sync.
 */
export function IssueReactionBar({
   issueId,
   reactions,
}: {
   issueId: string;
   reactions: Reaction[];
   /** Mantido por compat; a barra é otimista e não força refetch. */
   onChanged?: () => void;
}) {
   const [local, setLocal] = useState<Reaction[]>(reactions);
   const [picking, setPicking] = useState(false);
   const customEmojis = useCustomEmojis();
   const rootRef = useRef<HTMLDivElement>(null);

   // Ressincroniza com o servidor quando o detail é refetchado (ex.: reação de outro
   // usuário via SSE). O clique local já reflete otimista antes disso.
   useEffect(() => setLocal(reactions), [reactions]);

   // Fecha o picker ao clicar fora (o Linear também fecha).
   useEffect(() => {
      if (!picking) return;
      const onDown = (e: MouseEvent) => {
         if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPicking(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
   }, [picking]);

   const react = (emoji: string) => {
      const wasReacted = local.find((r) => r.emoji === emoji)?.reactedByMe ?? false;
      const prev = local;
      setLocal((cur) => applyToggle(cur, emoji)); // otimista, instantâneo
      setPicking(false);
      const call = wasReacted
         ? api.issues.removeReaction(issueId, emoji)
         : api.issues.addReaction(issueId, emoji);
      void call.catch(() => {
         setLocal(prev); // revert
         toast.error(wasReacted ? 'Could not remove the reaction' : 'Could not add the reaction');
      });
   };

   return (
      <div ref={rootRef} className="flex items-center flex-wrap gap-1.5">
         {local.map((reaction) => (
            <button
               key={reaction.emoji}
               type="button"
               onClick={() => void react(reaction.emoji)}
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
