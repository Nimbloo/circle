'use client';

import { addReviewComment, fetchReview, latestVerdict } from '@/lib/adapters-reviews';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { Button } from '@/components/ui/button';
import type { Review, ReviewComment, ReviewVerdictKind } from '@/data/reviews';
import { REVIEW_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check, CircleSlash } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type ReviewCommentsHandle, VerdictBadge } from './review-comments';
import { ReviewDiff } from './review-diff';
import { ReviewGuide } from './review-guide';
import { ReviewOverview } from './review-overview';
import { DiffStat, IssueCheckIcon, PrIcon } from './review-shared';

export type ReviewSection = 'overview' | 'guide' | 'diff';

/** Abas do detalhe; o path segue as rotas existentes (`/review`, `/changes`). */
const SECTIONS: { id: ReviewSection; label: string; path: string }[] = [
   { id: 'overview', label: 'Overview', path: '' },
   { id: 'guide', label: 'Guide', path: '/review' },
   { id: 'diff', label: 'Diff', path: '/changes' },
];

const VERDICT_TOAST: Record<ReviewVerdictKind, string> = {
   approve: 'Review approved',
   request_changes: 'Changes requested',
};

/** Right pane of the Reviews split view: breadcrumb, veredito, abas e a seção ativa do PR. */
export function ReviewDetail({
   reviewId,
   section = 'overview',
}: {
   reviewId: string;
   section?: ReviewSection;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const me = useWorkspaceStore((s) => s.me);
   const [review, setReview] = useState<Review | null>(null);
   const [loading, setLoading] = useState(true);
   const [reloadKey, setReloadKey] = useState(0);
   const [verdictBusy, setVerdictBusy] = useState<ReviewVerdictKind | null>(null);

   useEffect(() => {
      let active = true;
      // Recarga por realtime não volta pro skeleton — só o 1º fetch (ou troca de review).
      if (reloadKey === 0) setLoading(true);
      fetchReview(reviewId)
         .then((data) => {
            if (active) setReview(data);
         })
         .catch(() => {
            if (active && reloadKey === 0) setReview(null);
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [reviewId, reloadKey]);

   // Realtime: comentário/veredito de OUTRO usuário neste review → refaz o fetch.
   useEffect(() => {
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (!id || id === reviewId) setReloadKey((k) => k + 1);
      };
      window.addEventListener(REVIEW_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(REVIEW_CHANGED_EVENT, onChanged);
   }, [reviewId]);

   /** Splice na thread + recálculo do veredito, sem refetch (mutações do próprio usuário). */
   const mutateComments = useCallback((fn: (comments: ReviewComment[]) => ReviewComment[]) => {
      setReview((current) => {
         if (!current) return current;
         const comments = fn(current.comments);
         return { ...current, comments, verdict: latestVerdict(comments) };
      });
   }, []);

   const handle = useMemo<ReviewCommentsHandle>(
      () => ({ reviewId, meId: me?.id, isAdmin: !!me?.admin, mutate: mutateComments }),
      [reviewId, me?.id, me?.admin, mutateComments]
   );

   const submitVerdict = async (kind: ReviewVerdictKind) => {
      if (verdictBusy) return;
      setVerdictBusy(kind);
      try {
         const created = await addReviewComment(reviewId, { body: '', kind });
         mutateComments((cs) => [...cs, created]);
         toast.success(VERDICT_TOAST[kind]);
      } catch {
         toast.error(
            kind === 'approve' ? 'Could not approve the review' : 'Could not request changes'
         );
      } finally {
         setVerdictBusy(null);
      }
   };

   if (loading) return <ListSkeleton rows={6} />;

   if (!review) {
      return (
         <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Review not found
         </div>
      );
   }

   return (
      <div className="h-full flex flex-col overflow-hidden">
         <div className="flex items-center gap-2 px-4 h-10 border-b shrink-0 min-w-0">
            {/* Só linka pra issue quando o PR resolve uma (título com [ABC-123]);
                senão o link ia pra /issue/ (morto). */}
            {review.resolves.identifier && (
               <>
                  <Link
                     href={`/${orgId}/issue/${review.resolves.identifier}`}
                     className="flex items-center gap-1.5 shrink-0 hover:opacity-80"
                  >
                     <IssueCheckIcon />
                     <span className="text-sm font-medium">{review.resolves.identifier}</span>
                  </Link>
                  <span className="text-muted-foreground text-xs shrink-0">›</span>
               </>
            )}
            <PrIcon status={review.status} />
            <span className="text-sm font-medium truncate">{review.title}</span>
            <DiffStat additions={review.additions} deletions={review.deletions} />
            {review.verdict && <VerdictBadge kind={review.verdict.kind} className="shrink-0" />}
            <span className="flex-1" />
            {review.status === 'open' && (
               <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <Button
                     size="xxs"
                     variant="ghost"
                     onClick={() => void submitVerdict('request_changes')}
                     disabled={verdictBusy !== null}
                     className="text-muted-foreground hover:text-foreground"
                  >
                     <CircleSlash className="size-3.5" />
                     Request changes
                  </Button>
                  <Button
                     size="xxs"
                     variant="outline"
                     onClick={() => void submitVerdict('approve')}
                     disabled={verdictBusy !== null}
                  >
                     <Check className="size-3.5" />
                     Approve
                  </Button>
               </div>
            )}
            <nav aria-label="Review sections" className="flex items-center gap-1 shrink-0">
               {SECTIONS.map((candidate) => (
                  <Link
                     key={candidate.id}
                     href={`/${orgId}/review/${encodeURIComponent(reviewId)}${candidate.path}`}
                     aria-current={section === candidate.id ? 'page' : undefined}
                     className={cn(
                        'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
                        section === candidate.id
                           ? 'bg-accent border-transparent'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {candidate.label}
                  </Link>
               ))}
            </nav>
         </div>
         <div className="flex-1 min-h-0 overflow-hidden">
            {section === 'diff' ? (
               <ReviewDiff review={review} handle={handle} />
            ) : section === 'guide' ? (
               <ReviewGuide review={review} />
            ) : (
               <ReviewOverview review={review} handle={handle} />
            )}
         </div>
      </div>
   );
}
