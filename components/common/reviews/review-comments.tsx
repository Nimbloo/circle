'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { Review, ReviewComment, ReviewVerdictKind } from '@/data/reviews';
import { addReviewComment, removeReviewComment, updateReviewComment } from '@/lib/adapters-reviews';
import { cn } from '@/lib/utils';
import { Check, CircleSlash, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Ponte entre a thread (Overview/Diff) e o estado do review no `ReviewDetail`: quem
 * é o usuário atual (edição/exclusão), e `mutate` para aplicar splice otimista na lista
 * de comentários (o veredito é recalculado pelo dono do estado).
 */
export interface ReviewCommentsHandle {
   reviewId: string;
   meId?: string;
   isAdmin: boolean;
   mutate: (fn: (comments: ReviewComment[]) => ReviewComment[]) => void;
}

const VERDICT_LABEL: Record<ReviewVerdictKind, string> = {
   approve: 'Approved',
   request_changes: 'Changes requested',
};

/** Selo do veredito ("Approved" verde / "Changes requested" vermelho). */
export function VerdictBadge({ kind, className }: { kind: ReviewVerdictKind; className?: string }) {
   const approved = kind === 'approve';
   return (
      <span
         data-verdict={kind}
         className={cn(
            'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap',
            approved
               ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
               : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
            className
         )}
      >
         {approved ? <Check className="size-3" /> : <CircleSlash className="size-3" />}
         {VERDICT_LABEL[kind]}
      </span>
   );
}

function byCreatedAt(a: ReviewComment, b: ReviewComment): number {
   return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Composer de comentário de review (textarea simples, Cmd/Ctrl+Enter envia). `path`/`line`
 * ancoram no arquivo/linha do diff. Só chama `onPosted` depois que a API confirma.
 */
export function ReviewCommentComposer({
   handle,
   path = null,
   line = null,
   onPosted,
   onCancel,
   autoFocus = false,
   placeholder = 'Leave a comment...',
   className,
}: {
   handle: ReviewCommentsHandle;
   path?: string | null;
   line?: number | null;
   onPosted?: (comment: ReviewComment) => void;
   onCancel?: () => void;
   autoFocus?: boolean;
   placeholder?: string;
   className?: string;
}) {
   const [draft, setDraft] = useState('');
   const [submitting, setSubmitting] = useState(false);

   const submit = async () => {
      const body = draft.trim();
      if (!body || submitting) return;
      setSubmitting(true);
      try {
         const created = await addReviewComment(handle.reviewId, { body, path, line });
         handle.mutate((cs) => [...cs, created].sort(byCreatedAt));
         setDraft('');
         onPosted?.(created);
      } catch {
         toast.error('Could not post the comment');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div
         className={cn(
            'rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-2',
            className
         )}
      >
         <textarea
            autoFocus={autoFocus}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
               if (event.key === 'Escape' && onCancel) {
                  event.preventDefault();
                  onCancel();
                  return;
               }
               if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
            }}
            placeholder={placeholder}
            aria-label={
               line != null
                  ? `Comment on line ${line}`
                  : path
                    ? `Comment on ${path}`
                    : 'Leave a comment'
            }
            rows={2}
            disabled={submitting}
            className="w-full resize-none bg-transparent outline-none text-sm font-sans placeholder:text-muted-foreground disabled:opacity-60"
         />
         <div className="flex items-center justify-end gap-2">
            {onCancel && (
               <Button size="xs" variant="ghost" onClick={onCancel} disabled={submitting}>
                  Cancel
               </Button>
            )}
            <Button size="xs" onClick={() => void submit()} disabled={!draft.trim() || submitting}>
               {submitting ? 'Posting…' : 'Comment'}
            </Button>
         </div>
      </div>
   );
}

/**
 * Um comentário da thread: autor, tempo, selo do veredito, âncora (arquivo:linha) e as
 * ações de editar (só o autor) / excluir (autor ou admin). Exclusão é otimista com rollback.
 */
export function ReviewCommentItem({
   comment,
   handle,
   showAnchor = false,
   className,
}: {
   comment: ReviewComment;
   handle: ReviewCommentsHandle;
   /** Mostra o chip `path:line` (thread do Overview; no Diff a âncora é o próprio lugar). */
   showAnchor?: boolean;
   className?: string;
}) {
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState('');
   const [busy, setBusy] = useState(false);

   const isAuthor = !!handle.meId && comment.author?.id === handle.meId;
   const canEdit = isAuthor;
   const canDelete = isAuthor || handle.isAdmin;
   const authorName = comment.author?.name ?? 'Unknown';

   const save = async () => {
      const body = draft.trim();
      if (!body || busy) return;
      setBusy(true);
      try {
         const updated = await updateReviewComment(handle.reviewId, comment.id, body);
         handle.mutate((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
         setEditing(false);
      } catch {
         toast.error('Could not save the comment');
      } finally {
         setBusy(false);
      }
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      // Otimista: tira da thread já; se a API falhar, volta pro lugar (ordem por data).
      handle.mutate((cs) => cs.filter((c) => c.id !== comment.id));
      try {
         await removeReviewComment(handle.reviewId, comment.id);
      } catch {
         handle.mutate((cs) => [...cs, comment].sort(byCreatedAt));
         toast.error('Could not delete the comment');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div
         data-comment-id={comment.id}
         className={cn(
            'group/review-comment rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-1.5 font-sans',
            className
         )}
      >
         <div className="flex items-center gap-2 min-w-0">
            <Avatar className="size-5">
               <AvatarImage src={comment.author?.avatarUrl || undefined} alt={authorName} />
               <AvatarFallback className="text-[9px]">{authorName[0]}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{authorName}</span>
            <span className="text-xs text-muted-foreground shrink-0">{comment.timeAgo}</span>
            {comment.kind !== 'comment' && <VerdictBadge kind={comment.kind} />}
            {showAnchor && comment.path && (
               <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-px text-[11px] font-mono text-muted-foreground truncate">
                  <MessageSquare className="size-3 shrink-0" />
                  {comment.path}
                  {comment.line != null && `:${comment.line}`}
               </span>
            )}
            {(canEdit || canDelete) && !editing && (
               <div className="ml-auto flex items-center gap-1 opacity-0 group-hover/review-comment:opacity-100 focus-within:opacity-100">
                  {canEdit && (
                     <button
                        type="button"
                        onClick={() => {
                           setDraft(comment.body);
                           setEditing(true);
                        }}
                        aria-label="Edit comment"
                        className="text-muted-foreground hover:text-foreground"
                     >
                        <Pencil className="size-3.5" />
                     </button>
                  )}
                  {canDelete && (
                     <button
                        type="button"
                        onClick={() => void remove()}
                        disabled={busy}
                        aria-label="Delete comment"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                     >
                        <Trash2 className="size-3.5" />
                     </button>
                  )}
               </div>
            )}
         </div>

         {editing ? (
            <div className="flex flex-col gap-2">
               <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                     if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save();
                     if (event.key === 'Escape') setEditing(false);
                  }}
                  rows={2}
                  autoFocus
                  aria-label="Edit comment body"
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
            comment.body && (
               <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {comment.body}
               </p>
            )
         )}
      </div>
   );
}

/** Seção "Comments" do Overview: thread cronológica (inclui os ancorados) + composer no fim. */
export function ReviewCommentsSection({
   review,
   handle,
}: {
   review: Review;
   handle: ReviewCommentsHandle;
}) {
   return (
      <section aria-label="Comments" className="flex flex-col gap-3">
         <h2 className="text-lg font-semibold">
            Comments
            {review.comments.length > 0 && (
               <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {review.comments.length}
               </span>
            )}
         </h2>
         {review.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
         ) : (
            <div className="flex flex-col gap-2">
               {review.comments.map((comment) => (
                  <ReviewCommentItem
                     key={comment.id}
                     comment={comment}
                     handle={handle}
                     showAnchor
                  />
               ))}
            </div>
         )}
         <ReviewCommentComposer handle={handle} />
      </section>
   );
}
