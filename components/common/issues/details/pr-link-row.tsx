'use client';

import type { PrLink } from '@/data/issue-details';
import { GitPullRequestArrow } from 'lucide-react';
import Link from 'next/link';

/**
 * Um PR vinculado à issue (seção "Diffs"): `#número` leva à review do PR no Circle. Vínculo
 * antigo, sem review conhecida, mostra só o título (o id do vínculo é um hash interno).
 */
export function PrLinkRow({ pr, orgId }: { pr: PrLink; orgId: string }) {
   return (
      <div className="flex items-center gap-2 text-sm min-w-0">
         <GitPullRequestArrow
            className="size-3.5 shrink-0"
            style={{
               color: pr.status === 'merged' ? 'var(--review-merged)' : 'var(--review-open)',
            }}
         />
         {pr.reviewId && pr.number != null && (
            <Link
               href={`/${orgId}/review/${encodeURIComponent(pr.reviewId)}`}
               title={pr.repo ?? undefined}
               className="shrink-0 text-muted-foreground hover:text-foreground hover:underline"
            >
               #{pr.number}
            </Link>
         )}
         <span className="truncate">{pr.title}</span>
         <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
            {pr.status}
         </span>
      </div>
   );
}
