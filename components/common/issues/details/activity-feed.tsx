'use client';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ActivityItem, CommentReaction } from '@/data/issue-details';
import type { User } from '@/data/users';
import { api } from '@/lib/client';
import { blocksToMarkdown, textToBlocks } from '@/lib/text-blocks';
import { cn } from '@/lib/utils';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CommentComposer } from './comment-composer';
import { AttachmentChip } from './attachment-chip';
import {
   Ban,
   CalendarClock,
   CheckCircle2,
   CircleDot,
   Copy,
   Folder,
   GitPullRequestArrow,
   Gauge,
   Link2,
   ListTree,
   MoreHorizontal,
   Pencil,
   PenLine,
   RefreshCcw,
   Reply,
   RotateCcw,
   SignpostBig,
   SmilePlus,
   Tag,
   Trash2,
   Timer,
   Unlock,
   UserRound,
   Workflow,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useCustomEmojis, customEmojiUrl } from '@/hooks/use-custom-emojis';
import { toast } from 'sonner';
import { ContentBlocks } from './content-blocks';
import { isCommentSubmitKey } from '@/lib/comment-submit-key';
import { userDisplayName } from '@/lib/display-name';

const EVENT_ICONS: Record<string, ReactNode> = {
   created: <PenLine className="size-3.5" />,
   status: <CircleDot className="size-3.5" />,
   label: <Tag className="size-3.5" />,
   priority: <CircleDot className="size-3.5" />,
   cycle: <RefreshCcw className="size-3.5" />,
   blocked: <Ban className="size-3.5" />,
   unblocked: <Unlock className="size-3.5" />,
   related: <Link2 className="size-3.5" />,
   duplicate: <Copy className="size-3.5" />,
   sub: <ListTree className="size-3.5" />,
   assignee: <UserRound className="size-3.5" />,
   title: <Pencil className="size-3.5" />,
   project: <Folder className="size-3.5" />,
   estimate: <Gauge className="size-3.5" />,
   dueDate: <CalendarClock className="size-3.5" />,
   milestone: <SignpostBig className="size-3.5" />,
   pr: <GitPullRequestArrow className="size-3.5" />,
   sla: <Timer className="size-3.5" />,
   automation: <Workflow className="size-3.5" />,
};

type CommentItem = Extract<ActivityItem, { kind: 'comment' }>;

/** Respostas além deste número ficam colapsadas atrás de "N replies · last X". */
const COLLAPSE_REPLIES_ABOVE = 2;

/** Contexto da issue necessário a ações do comentário (permissões e "Convert to sub-issue"). */
export interface ActivityIssueContext {
   teamId?: string;
   projectId?: string | null;
   assigneeId?: string | null;
}

function EventRow({ item }: { item: Extract<ActivityItem, { kind: 'event' }> }) {
   return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1.5">
         <span className="size-5 rounded-full bg-accent flex items-center justify-center shrink-0">
            {EVENT_ICONS[item.event] ?? <CircleDot className="size-3.5" />}
         </span>
         <span className="min-w-0 truncate">
            <span className="text-foreground/90 font-medium">{userDisplayName(item.actor)}</span>{' '}
            {item.text}
         </span>
         <span className="shrink-0 text-xs">· {item.timeAgo}</span>
      </div>
   );
}

/** Patch otimista de um comentário (reação, edição, resolve) aplicado pelo dono do estado. */
export type CommentPatch = Partial<
   Pick<CommentItem, 'reactions' | 'body' | 'source' | 'updatedAt' | 'resolvedAt' | 'resolvedBy'>
>;

/** Reações depois de ligar/desligar `emoji` pelo usuário atual (espelha o servidor). */
function toggleReaction(
   list: CommentReaction[],
   emoji: string,
   reacted: boolean
): CommentReaction[] {
   if (reacted) {
      return list
         .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r))
         .filter((r) => r.count > 0);
   }
   if (list.some((r) => r.emoji === emoji))
      return list.map((r) =>
         r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r
      );
   return [...list, { emoji, count: 1, reactedByMe: true }];
}

/**
 * Texto (markdown) editável do comentário. Parte do original quando o DTO o trouxe; senão
 * serializa TODOS os blocos — antes só os parágrafos voltavam e salvar apagava listas,
 * código e citações (is#2).
 */
function commentText(item: CommentItem): string {
   return item.source ?? blocksToMarkdown(item.body);
}

/** Primeira linha legível do comentário (resumo da thread resolvida). */
function previewText(item: CommentItem): string {
   for (const b of item.body) {
      if ('text' in b && b.text) return b.text;
      if ('items' in b && b.items.length > 0) {
         const it = b.items[0];
         return typeof it === 'string' ? it : it.text;
      }
      if (b.type === 'code') return b.code.split('\n')[0];
   }
   return '';
}

function CommentCard({
   item,
   canManage,
   canResolve = false,
   onChanged,
   issueId,
   issueContext,
   meId,
   isAdmin = false,
   replies = [],
   isReply = false,
   onReply,
   onPatch,
   onOwnAction,
   onIssueChanged,
   meUser = null,
}: {
   item: CommentItem;
   canManage: boolean;
   /** Resolver/reabrir a thread: autor da raiz, responsável da issue ou admin. */
   canResolve?: boolean;
   onChanged?: () => void;
   issueId?: string;
   issueContext?: ActivityIssueContext;
   meId?: string;
   isAdmin?: boolean;
   replies?: CommentItem[];
   isReply?: boolean;
   /** Numa resposta: pede ao pai (raiz) pra abrir o composer de reply. */
   onReply?: () => void;
   /** Aplica um patch otimista no comentário (sem ele, a ação recarrega via `onChanged`). */
   onPatch?: (id: string, patch: CommentPatch) => void;
   /** Avisa o dono que a próxima mudança remota desta issue é eco desta ação. */
   onOwnAction?: () => void;
   /** Ação que muda a issue além do feed (ex.: sub-issue criada). */
   onIssueChanged?: () => void;
   meUser?: User | null;
}) {
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState('');
   const [busy, setBusy] = useState(false);
   const [picking, setPicking] = useState(false);
   const [replying, setReplying] = useState(false);
   const [confirmingDelete, setConfirmingDelete] = useState(false);
   // Respostas: colapsadas por padrão quando > 2 (ou quando a thread está resolvida).
   const [expanded, setExpanded] = useState(false);
   const customEmojis = useCustomEmojis();

   const resolved = !!item.resolvedAt;
   const attachments = item.attachments ?? [];

   // `reactedByMe` é server-truth (vem do DTO), agora modelado em CommentReaction.
   const reactions: CommentReaction[] = item.reactions ?? [];
   const didReact = (emoji: string) =>
      reactions.find((r) => r.emoji === emoji)?.reactedByMe ?? false;

   // Reação otimista (#27): o chip muda na hora; falha desfaz. Sem `onPatch`, recarrega.
   const react = async (emoji: string) => {
      if (busy) return;
      const reacted = didReact(emoji);
      const prev = reactions;
      onOwnAction?.();
      onPatch?.(item.id, { reactions: toggleReaction(prev, emoji, reacted) });
      setPicking(false);
      setBusy(true);
      try {
         if (reacted) {
            await api.comments.removeReaction(item.id, emoji);
         } else {
            await api.comments.addReaction(item.id, emoji);
         }
         if (!onPatch) onChanged?.();
      } catch {
         onPatch?.(item.id, { reactions: prev });
         toast.error(reacted ? 'Could not remove the reaction' : 'Could not add the reaction');
      } finally {
         setBusy(false);
      }
   };

   const startEdit = () => {
      setDraft(commentText(item));
      setEditing(true);
   };

   const save = async () => {
      const text = draft.trim();
      if (!text || busy) return;
      const prev = { body: item.body, source: item.source, updatedAt: item.updatedAt };
      if (onPatch) {
         // Otimista: o texto novo aparece na hora; falha volta o anterior e reabre a edição.
         onOwnAction?.();
         onPatch(item.id, {
            body: textToBlocks(text),
            source: text,
            updatedAt: new Date().toISOString(),
         });
         setEditing(false);
      }
      setBusy(true);
      try {
         await api.comments.update(item.id, text);
         setEditing(false);
         if (!onPatch) onChanged?.();
      } catch {
         if (onPatch) {
            onPatch(item.id, prev);
            setEditing(true);
         }
         toast.error('Could not save the comment');
      } finally {
         setBusy(false);
      }
   };

   const remove = async () => {
      setBusy(true);
      try {
         onOwnAction?.();
         await api.comments.remove(item.id);
         onChanged?.();
      } catch {
         toast.error('Could not delete the comment');
      } finally {
         setBusy(false);
      }
   };

   const toggleResolved = async () => {
      if (busy) return;
      const prev = { resolvedAt: item.resolvedAt, resolvedBy: item.resolvedBy };
      onOwnAction?.();
      onPatch?.(
         item.id,
         resolved
            ? { resolvedAt: null, resolvedBy: null }
            : { resolvedAt: new Date().toISOString(), resolvedBy: meUser }
      );
      setBusy(true);
      try {
         await api.comments.resolve(item.id, !resolved);
         if (!onPatch) onChanged?.();
      } catch {
         onPatch?.(item.id, prev);
         toast.error(resolved ? 'Could not reopen the thread' : 'Could not resolve the thread');
      } finally {
         setBusy(false);
      }
   };

   /**
    * Cria uma sub-issue a partir do comentário (1ª linha = título, resto = descrição) e
    * anexa ao comentário a referência `Sub-issue: ENG-12` (só quando o ator é o autor —
    * a edição de comentário é restrita ao autor no servidor).
    */
   const convertToSubIssue = async () => {
      if (!issueId || !issueContext?.teamId || busy) return;
      const text = commentText(item);
      const [firstLine, ...rest] = text.split('\n');
      const title = firstLine.trim().slice(0, 255);
      if (!title) return;
      setBusy(true);
      try {
         const dto = await api.issues.create({
            teamId: issueContext.teamId,
            projectId: issueContext.projectId ?? null,
            parentId: issueId,
            title,
            description: rest.join('\n').trim() || null,
            statusId: 'to-do',
            priorityId: 'no-priority',
         });
         try {
            await useIssuesStore.getState().applyRemote(dto.id);
         } catch {
            // store fora de sincronia não é erro do usuário — o refetch do detail cobre
         }
         if (canManage) {
            try {
               await api.comments.update(item.id, `${text}\n\nSub-issue: ${dto.identifier}`);
            } catch {
               // referência no comentário é conveniência; a sub-issue já existe
            }
         }
         toast.success(`Sub-issue ${dto.identifier} created`);
         (onIssueChanged ?? onChanged)?.();
      } catch {
         toast.error('Could not convert the comment into a sub-issue');
      } finally {
         setBusy(false);
      }
   };

   const removeAttachment = async (id: string) => {
      try {
         onOwnAction?.();
         await api.attachments.remove(id);
         onChanged?.();
      } catch {
         toast.error('Could not remove the attachment');
      }
   };

   const openReply = () => {
      if (isReply) {
         onReply?.();
         return;
      }
      setExpanded(true);
      setReplying(true);
   };

   const showMenu = !isReply && (canResolve || (!!issueContext?.teamId && !!issueId));
   const lastReply = replies[replies.length - 1];
   const repliesCollapsed =
      !expanded && (resolved ? replies.length > 0 : replies.length > COLLAPSE_REPLIES_ABOVE);

   return (
      <div className={cn(!isReply && 'my-2')} data-comment-id={item.id}>
         {resolved && !isReply && !expanded ? (
            // Raiz resolvida: linha compacta com check verde; clicar expande a thread.
            <button
               type="button"
               onClick={() => setExpanded(true)}
               aria-expanded={false}
               className="group/comment flex w-full items-center gap-2 rounded-lg border border-border/60 bg-container px-3.5 py-2 text-left text-sm hover:bg-accent/40"
            >
               <CheckCircle2 className="size-4 shrink-0 text-green-500" />
               <span className="font-medium">{userDisplayName(item.actor)}</span>
               <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {previewText(item)}
               </span>
               <span className="shrink-0 text-xs text-muted-foreground">
                  Resolved{item.resolvedBy ? ` by ${userDisplayName(item.resolvedBy)}` : ''}
                  {replies.length > 0 &&
                     ` · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
               </span>
            </button>
         ) : (
            <div
               className={cn(
                  'group/comment rounded-lg border border-border/60 bg-container p-3.5',
                  resolved && 'border-green-500/30'
               )}
            >
               <div className="flex items-center gap-2 mb-1.5">
                  <Avatar className="size-5">
                     <AvatarImage src={item.actor.avatarUrl || undefined} alt={item.actor.name} />
                     <AvatarFallback>{item.actor.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{userDisplayName(item.actor)}</span>
                  <span className="text-xs text-muted-foreground">{item.timeAgo}</span>
                  {item.updatedAt && (
                     <span
                        className="text-xs text-muted-foreground"
                        title={`Edited ${new Date(item.updatedAt).toLocaleString()}`}
                     >
                        · edited
                     </span>
                  )}
                  {resolved && (
                     <span className="inline-flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 className="size-3.5" />
                        Resolved
                     </span>
                  )}
                  {!editing && (
                     <div className="ml-auto flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100">
                        {issueId && (
                           <button
                              type="button"
                              onClick={openReply}
                              aria-label="Reply"
                              className="text-muted-foreground hover:text-foreground"
                           >
                              <Reply className="size-3.5" />
                           </button>
                        )}
                        {canManage && (
                           <>
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
                                 onClick={() => setConfirmingDelete(true)}
                                 disabled={busy}
                                 aria-label="Delete comment"
                                 className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                              >
                                 <Trash2 className="size-3.5" />
                              </button>
                           </>
                        )}
                        {showMenu && (
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <button
                                    type="button"
                                    aria-label="More actions"
                                    disabled={busy}
                                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                                 >
                                    <MoreHorizontal className="size-3.5" />
                                 </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                 {canResolve && (
                                    <DropdownMenuItem onSelect={() => void toggleResolved()}>
                                       {resolved ? (
                                          <>
                                             <RotateCcw className="size-4" /> Reopen thread
                                          </>
                                       ) : (
                                          <>
                                             <CheckCircle2 className="size-4" /> Resolve thread
                                          </>
                                       )}
                                    </DropdownMenuItem>
                                 )}
                                 {issueContext?.teamId && issueId && (
                                    <DropdownMenuItem onSelect={() => void convertToSubIssue()}>
                                       <ListTree className="size-4" /> Convert to sub-issue
                                    </DropdownMenuItem>
                                 )}
                              </DropdownMenuContent>
                           </DropdownMenu>
                        )}
                     </div>
                  )}
               </div>

               {editing ? (
                  <div className="flex flex-col gap-2">
                     <textarea
                        aria-label="Edit comment"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                           // is#22: mesmos atalhos do composer (tecla de envio da preferência
                           // "Send comments on..."), Esc cancela.
                           if (isCommentSubmitKey(e)) {
                              e.preventDefault();
                              void save();
                           } else if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditing(false);
                           }
                        }}
                        rows={Math.min(12, Math.max(2, draft.split('\n').length))}
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
                        <Button
                           size="xs"
                           onClick={() => void save()}
                           disabled={!draft.trim() || busy}
                        >
                           Save
                        </Button>
                     </div>
                  </div>
               ) : (
                  <div className="text-sm [&_p]:my-1.5">
                     <ContentBlocks blocks={item.body} />
                  </div>
               )}

               {attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                     {attachments.map((a) => (
                        <AttachmentChip
                           key={a.id}
                           item={a}
                           onRemove={
                              meId && (isAdmin || a.uploadedById === meId)
                                 ? () => removeAttachment(a.id)
                                 : undefined
                           }
                        />
                     ))}
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
                              <img
                                 src={url}
                                 alt={reaction.emoji}
                                 className="size-4 object-contain"
                              />
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
                  {issueId && (
                     <button
                        type="button"
                        onClick={openReply}
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
                              <img
                                 src={e.url}
                                 alt={e.shortcode}
                                 className="size-4 object-contain"
                              />
                           </button>
                        ))}
                     </div>
                  )}
               </div>
            </div>
         )}

         {/* Thread: respostas (colapsadas quando > 2) + composer de resposta, só na raiz */}
         {!isReply && !(resolved && !expanded) && (replies.length > 0 || replying) && (
            <div className="ml-5 mt-1 flex flex-col gap-1 border-l border-border/50 pl-3">
               {repliesCollapsed ? (
                  <button
                     type="button"
                     onClick={() => setExpanded(true)}
                     aria-expanded={false}
                     className="flex items-center gap-2 self-start py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                     <span className="flex -space-x-1.5">
                        {[...new Map(replies.map((r) => [r.actor.id, r.actor])).values()]
                           .slice(0, 3)
                           .map((actor) => (
                              <Avatar key={actor.id} className="size-4 ring-1 ring-background">
                                 <AvatarImage src={actor.avatarUrl || undefined} alt={actor.name} />
                                 <AvatarFallback className="text-[8px]">
                                    {actor.name[0]}
                                 </AvatarFallback>
                              </Avatar>
                           ))}
                     </span>
                     <span className="font-medium text-foreground/80">
                        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                     </span>
                     {lastReply && <span>· last {lastReply.timeAgo}</span>}
                  </button>
               ) : (
                  replies.map((reply) => (
                     <CommentCard
                        key={reply.id}
                        item={reply}
                        canManage={!!meId && reply.actor.id === meId}
                        onChanged={onChanged}
                        issueId={issueId}
                        meId={meId}
                        isAdmin={isAdmin}
                        isReply
                        onReply={openReply}
                        onPatch={onPatch}
                        onOwnAction={onOwnAction}
                        onIssueChanged={onIssueChanged}
                        meUser={meUser}
                     />
                  ))
               )}
               {replying && issueId && (
                  <CommentComposer
                     issueId={issueId}
                     parentId={item.id}
                     autoFocus
                     placeholder="Reply… (@ to mention)"
                     onCancel={() => setReplying(false)}
                     onPosted={() => {
                        setReplying(false);
                        onOwnAction?.();
                        onChanged?.();
                     }}
                  />
               )}
            </div>
         )}

         {/* is#3: excluir pede confirmação — na raiz, as respostas vão junto. */}
         <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                  <AlertDialogDescription>
                     {!isReply && replies.length > 0
                        ? `This comment and its ${replies.length} ${
                             replies.length === 1 ? 'reply' : 'replies'
                          } will be permanently deleted.`
                        : 'This comment will be permanently deleted.'}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     className={buttonVariants({ variant: 'destructive' })}
                     onClick={() => void remove()}
                  >
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}

/**
 * Issue activity: interleaved events and comments, plus a comment composer
 * que persiste via api.issues.addComment; após o POST o pai recarrega o feed
 * (`onCommentAdded`). Reação, edição e resolve são otimistas via `onCommentPatch`.
 */
export function ActivityFeed({
   activity,
   issueId,
   issueContext,
   onCommentAdded,
   onCommentPatch,
   onOwnAction,
   onIssueChanged,
}: {
   activity: ActivityItem[];
   issueId?: string;
   /** Time/projeto/responsável da issue — permissão de resolver e "Convert to sub-issue". */
   issueContext?: ActivityIssueContext;
   /** Recarrega o feed (comentário novo/removido, anexo). */
   onCommentAdded?: () => void;
   /** Patch otimista de um comentário; ausente = cada ação recarrega via `onCommentAdded`. */
   onCommentPatch?: (id: string, patch: CommentPatch) => void;
   /** A ação partiu desta aba: o eco remoto dela não precisa recarregar o detalhe. */
   onOwnAction?: () => void;
   /** Ação que muda a issue além do feed (sub-issue criada a partir do comentário). */
   onIssueChanged?: () => void;
}) {
   const items = activity;
   const me = useWorkspaceStore((s) => s.me);
   const meId = me?.id;
   const meUser = useWorkspaceStore((s) => (meId ? s.users.find((u) => u.id === meId) : undefined));
   const isAdmin = !!me?.admin;

   // Threading: separa as respostas (parentId != null) dos itens de topo e as
   // agrupa por pai. Respostas NÃO aparecem no feed cronológico de topo — vão
   // aninhadas sob o comentário-raiz.
   const repliesByParent = new Map<string, CommentItem[]>();
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
                     canResolve={
                        !!meId &&
                        (isAdmin || item.actor.id === meId || issueContext?.assigneeId === meId)
                     }
                     onChanged={onCommentAdded}
                     issueId={issueId}
                     issueContext={issueContext}
                     meId={meId}
                     isAdmin={isAdmin}
                     replies={repliesByParent.get(item.id) ?? []}
                     onPatch={onCommentPatch}
                     onOwnAction={onOwnAction}
                     onIssueChanged={onIssueChanged}
                     meUser={meUser ?? null}
                  />
               )
            )}
         </div>

         {issueId && (
            <CommentComposer
               issueId={issueId}
               onPosted={() => {
                  onOwnAction?.();
                  onCommentAdded?.();
               }}
            />
         )}
      </div>
   );
}
