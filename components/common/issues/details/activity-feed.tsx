'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ActivityItem, CommentReaction } from '@/data/issue-details';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CommentComposer } from './comment-composer';
import {
   Ban,
   CircleDot,
   GitPullRequestArrow,
   Link2,
   Pencil,
   PenLine,
   RefreshCcw,
   Reply,
   SmilePlus,
   Tag,
   Trash2,
   Unlock,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useCustomEmojis, customEmojiUrl } from '@/hooks/use-custom-emojis';
import { toast } from 'sonner';
import { ContentBlocks } from './content-blocks';

const EVENT_ICONS: Record<string, ReactNode> = {
   created: <PenLine className="size-3.5" />,
   status: <CircleDot className="size-3.5" />,
   label: <Tag className="size-3.5" />,
   priority: <CircleDot className="size-3.5" />,
   cycle: <RefreshCcw className="size-3.5" />,
   blocked: <Ban className="size-3.5" />,
   unblocked: <Unlock className="size-3.5" />,
   related: <Link2 className="size-3.5" />,
   pr: <GitPullRequestArrow className="size-3.5" />,
};

function EventRow({ item }: { item: Extract<ActivityItem, { kind: 'event' }> }) {
   return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1.5">
         <span className="size-5 rounded-full bg-accent flex items-center justify-center shrink-0">
            {EVENT_ICONS[item.event] ?? <CircleDot className="size-3.5" />}
         </span>
         <span className="min-w-0 truncate">
            <span className="text-foreground/90 font-medium">{item.actor.name}</span> {item.text}
         </span>
         <span className="shrink-0 text-xs">· {item.timeAgo}</span>
      </div>
   );
}

/** Junta os parágrafos de um comentário em texto plano (para edição). */
function blocksToText(blocks: Extract<ActivityItem, { kind: 'comment' }>['body']): string {
   return blocks
      .map((b) => (b.type === 'paragraph' ? b.text : ''))
      .filter(Boolean)
      .join('\n\n');
}

function CommentCard({
   item,
   canManage,
   onChanged,
   issueId,
   meId,
   replies = [],
   isReply = false,
}: {
   item: Extract<ActivityItem, { kind: 'comment' }>;
   canManage: boolean;
   onChanged?: () => void;
   issueId?: string;
   meId?: string;
   replies?: Extract<ActivityItem, { kind: 'comment' }>[];
   isReply?: boolean;
}) {
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState('');
   const [busy, setBusy] = useState(false);
   const [picking, setPicking] = useState(false);
   const [replying, setReplying] = useState(false);
   const customEmojis = useCustomEmojis();

   // `reactedByMe` é server-truth (vem do DTO), agora modelado em CommentReaction.
   const reactions: CommentReaction[] = item.reactions ?? [];
   const didReact = (emoji: string) =>
      reactions.find((r) => r.emoji === emoji)?.reactedByMe ?? false;

   const react = async (emoji: string) => {
      if (busy) return;
      const reacted = didReact(emoji);
      setBusy(true);
      try {
         if (reacted) {
            await api.comments.removeReaction(item.id, emoji);
         } else {
            await api.comments.addReaction(item.id, emoji);
         }
         setPicking(false);
         onChanged?.(); // refetch do detail → estado reflete o server-truth
      } catch {
         toast.error(reacted ? 'Could not remove the reaction' : 'Could not add the reaction');
      } finally {
         setBusy(false);
      }
   };

   const startEdit = () => {
      setDraft(blocksToText(item.body));
      setEditing(true);
   };

   const save = async () => {
      const text = draft.trim();
      if (!text || busy) return;
      setBusy(true);
      try {
         await api.comments.update(item.id, text);
         setEditing(false);
         onChanged?.();
      } catch {
         toast.error('Could not save the comment');
      } finally {
         setBusy(false);
      }
   };

   const remove = async () => {
      setBusy(true);
      try {
         await api.comments.remove(item.id);
         onChanged?.();
      } catch {
         toast.error('Could not delete the comment');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className={cn(!isReply && 'my-2')}>
         <div className="group/comment rounded-lg border border-border/60 bg-container p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
               <Avatar className="size-5">
                  <AvatarImage src={item.actor.avatarUrl || undefined} alt={item.actor.name} />
                  <AvatarFallback>{item.actor.name[0]}</AvatarFallback>
               </Avatar>
               <span className="text-sm font-medium">{item.actor.name}</span>
               <span className="text-xs text-muted-foreground">{item.timeAgo}</span>
               {canManage && !editing && (
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover/comment:opacity-100">
                     <button
                        type="button"
                        onClick={startEdit}
                        aria-label="Edit comment"
                        className="text-muted-foreground hover:text-foreground"
                     >
                        <Pencil className="size-3.5" />
                     </button>
                     <button
                        type="button"
                        onClick={() => void remove()}
                        disabled={busy}
                        aria-label="Delete comment"
                        className="text-muted-foreground hover:text-red-500 disabled:opacity-40"
                     >
                        <Trash2 className="size-3.5" />
                     </button>
                  </div>
               )}
            </div>

            {editing ? (
               <div className="flex flex-col gap-2">
                  <textarea
                     value={draft}
                     onChange={(e) => setDraft(e.target.value)}
                     rows={2}
                     disabled={busy}
                     className="w-full resize-none rounded-md border bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                  <div className="flex items-center justify-end gap-2">
                     <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditing(false)}
                        disabled={busy}
                     >
                        Cancel
                     </Button>
                     <Button size="xs" onClick={() => void save()} disabled={!draft.trim() || busy}>
                        Save
                     </Button>
                  </div>
               </div>
            ) : (
               <div className="text-sm [&_p]:my-1.5">
                  <ContentBlocks blocks={item.body} />
               </div>
            )}

            <div className="flex items-center gap-1.5 mt-1">
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
                  onClick={() => setPicking((value) => !value)}
                  disabled={busy}
                  aria-label="Add reaction"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
               >
                  <SmilePlus className="size-3.5" />
               </button>
               {/* Reply só nos comentários-raiz (aninhamento de 1 nível, como o Linear) */}
               {!isReply && issueId && (
                  <button
                     type="button"
                     onClick={() => setReplying((v) => !v)}
                     aria-label="Reply"
                     className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                     <Reply className="size-3.5" />
                     Reply
                  </button>
               )}
               {picking && (
                  <div className="flex items-center flex-wrap gap-1 rounded-full border bg-container px-1.5 py-0.5 shadow-xs max-w-[220px]">
                     {['👍', '❤️', '🎉'].map((emoji) => (
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
         </div>

         {/* Respostas aninhadas + composer de resposta (só na raiz) */}
         {!isReply && (replies.length > 0 || replying) && (
            <div className="ml-5 mt-1 flex flex-col gap-1 border-l border-border/50 pl-3">
               {replies.map((reply) => (
                  <CommentCard
                     key={reply.id}
                     item={reply}
                     canManage={!!meId && reply.actor.id === meId}
                     onChanged={onChanged}
                     isReply
                  />
               ))}
               {replying && issueId && (
                  <CommentComposer
                     issueId={issueId}
                     parentId={item.id}
                     autoFocus
                     placeholder="Reply… (@ to mention)"
                     onCancel={() => setReplying(false)}
                     onPosted={() => {
                        setReplying(false);
                        onChanged?.();
                     }}
                  />
               )}
            </div>
         )}
      </div>
   );
}

/**
 * Issue activity: interleaved events and comments, plus a comment composer
 * que persiste via api.issues.addComment; após o POST o pai refetch o detail
 * (`onCommentAdded`), então o feed reflete o comentário real.
 */
export function ActivityFeed({
   activity,
   issueId,
   onCommentAdded,
}: {
   activity: ActivityItem[];
   issueId?: string;
   onCommentAdded?: () => void;
}) {
   const items = activity;
   const meId = useWorkspaceStore((s) => s.me?.id);

   // Threading: separa as respostas (parentId != null) dos itens de topo e as
   // agrupa por pai. Respostas NÃO aparecem no feed cronológico de topo — vão
   // aninhadas sob o comentário-raiz.
   const repliesByParent = new Map<string, Extract<ActivityItem, { kind: 'comment' }>[]>();
   for (const it of items) {
      if (it.kind === 'comment' && it.parentId) {
         const arr = repliesByParent.get(it.parentId) ?? [];
         arr.push(it);
         repliesByParent.set(it.parentId, arr);
      }
   }
   const topLevel = items.filter((it) => !(it.kind === 'comment' && it.parentId));

   return (
      <div className="mt-10">
         <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">Activity</h2>
         </div>

         <div className="flex flex-col">
            {topLevel.map((item) =>
               item.kind === 'event' ? (
                  <EventRow key={item.id} item={item} />
               ) : (
                  <CommentCard
                     key={item.id}
                     item={item}
                     canManage={!!meId && item.actor.id === meId}
                     onChanged={onCommentAdded}
                     issueId={issueId}
                     meId={meId}
                     replies={repliesByParent.get(item.id) ?? []}
                  />
               )
            )}
         </div>

         {issueId && <CommentComposer issueId={issueId} onPosted={() => onCommentAdded?.()} />}
      </div>
   );
}
