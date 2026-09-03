'use client';

import { cn } from '@/lib/utils';

/**
 * Chip discreto com o identifier do pai, antes do título da sub-issue nas views flat
 * (lista/board), como o Linear. Só texto muted — não compete com o título.
 */
export function ParentIssueChip({
   identifier,
   className,
}: {
   identifier: string;
   className?: string;
}) {
   return (
      <span
         data-testid="parent-issue-chip"
         className={cn(
            'mr-1.5 inline-flex shrink-0 items-center rounded bg-muted/60 px-1 text-[11px] font-medium leading-4 tabular-nums text-muted-foreground',
            className
         )}
      >
         {identifier}
      </span>
   );
}
