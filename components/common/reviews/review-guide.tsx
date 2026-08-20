'use client';

import type { Review } from '@/mock-data/reviews';
import { DiffStat, PrIcon } from './review-shared';

/**
 * Guide tab: narrated walk-through next to the relevant diff. The backend does
 * not expose guide sections (summary/files) yet, so the section body shows an
 * empty state instead of inventing prose.
 */
export function ReviewGuide({ review }: { review: Review }) {
   return (
      <div className="h-full overflow-y-auto relative">
         <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-10">
            <div className="flex flex-col gap-1.5">
               <h1 className="text-2xl font-semibold leading-snug">{review.title}</h1>
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono flex-wrap">
                  <PrIcon status={review.status} className="size-3.5" />
                  <span>
                     {review.repo}#{review.prNumber}
                  </span>
                  <span>·</span>
                  <span>
                     {review.targetBranch} ← {review.sourceBranch}
                  </span>
               </div>
            </div>

            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
               No guide available for this review.
            </div>
         </div>

         <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-container shadow-sm px-4 py-1.5 text-xs text-muted-foreground">
               {review.files.length} files changed
               <DiffStat additions={review.additions} deletions={review.deletions} />
            </span>
         </div>
      </div>
   );
}
