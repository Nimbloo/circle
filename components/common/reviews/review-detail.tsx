'use client';

import { fetchReview } from '@/lib/adapters-reviews';
import { ListSkeleton } from '@/components/common/list-skeleton';
import type { Review } from '@/data/reviews';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
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

/** Right pane of the Reviews split view: breadcrumb, abas e a seção ativa do PR. */
export function ReviewDetail({
   reviewId,
   section = 'overview',
}: {
   reviewId: string;
   section?: ReviewSection;
}) {
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
               <ReviewDiff review={review} />
            ) : section === 'guide' ? (
               <ReviewGuide review={review} />
            ) : (
               <ReviewOverview review={review} />
            )}
         </div>
      </div>
   );
}
