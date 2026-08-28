'use client';

import { fetchReview } from '@/lib/adapters-reviews';
import { ListSkeleton } from '@/components/common/list-skeleton';
import type { Review } from '@/data/reviews';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ReviewOverview } from './review-overview';
import { DiffStat, IssueCheckIcon, PrIcon } from './review-shared';

// Mantido para compat da assinatura da rota; a UI só mostra Overview (ver abaixo).
export type ReviewSection = 'overview' | 'guide' | 'diff';

/** Right pane of the Reviews split view: breadcrumb + Overview do PR. */
export function ReviewDetail({ reviewId }: { reviewId: string; section?: ReviewSection }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [review, setReview] = useState<Review | null>(null);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      let active = true;
      setLoading(true);
      fetchReview(reviewId)
         .then((data) => {
            if (active) setReview(data);
         })
         .catch(() => {
            if (active) setReview(null);
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [reviewId]);

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
            <span className="flex-1" />
         </div>
         {/* Só Overview: o backend espelha metadata do PR (título/status/branches/
             counts/checks), sem files/commits/diff — as abas Guide/Diff seriam vazias. */}
         <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewOverview review={review} />
         </div>
      </div>
   );
}
