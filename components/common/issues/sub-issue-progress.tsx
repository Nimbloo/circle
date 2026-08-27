'use client';

import { cn } from '@/lib/utils';

/**
 * Indicador de progresso de sub-issues (paridade Linear): um anel donut preenchido
 * pela razão concluídas/total + a contagem "done/count". Só aparece quando a issue
 * tem filhas (count > 0). O anel é um SVG de 2 círculos (trilha + progresso).
 */
export function SubIssueProgress({
   count,
   done,
   className,
}: {
   count?: number;
   done?: number;
   className?: string;
}) {
   if (!count || count <= 0) return null;
   const completed = done ?? 0;
   const ratio = Math.min(1, completed / count);
   const r = 5;
   const circumference = 2 * Math.PI * r;
   const dash = circumference * ratio;

   return (
      <span
         className={cn(
            'inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0 tabular-nums',
            className
         )}
         title={`${completed}/${count} sub-issues concluídas`}
      >
         <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0 -rotate-90">
            <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-border" />
            <circle
               cx="7"
               cy="7"
               r={r}
               fill="none"
               strokeWidth="2"
               strokeLinecap="round"
               className="stroke-primary"
               strokeDasharray={`${dash} ${circumference}`}
            />
         </svg>
         <span className="hidden sm:inline-block">
            {completed}/{count}
         </span>
      </span>
   );
}
