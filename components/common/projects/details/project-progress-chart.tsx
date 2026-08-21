'use client';

interface ProjectProgressChartProps {
   startDate: string;
   endDate: string;
   scope: number;
   started: number;
   completed: number;
}

const COLORS = { scope: '#8f9299', started: '#facc15', completed: '#6771c5' };

/**
 * Honest snapshot of the current Scope / Started / Completed totals.
 * No time axis is fabricated — there is no real per-day history behind these
 * numbers, so we show where the work stands right now as a segmented bar.
 */
export function ProjectProgressChart({ scope, started, completed }: ProjectProgressChartProps) {
   const total = Math.max(scope, started + completed);

   if (total === 0) {
      return (
         <div className="text-[11px] text-muted-foreground py-4 text-center">
            No progress history yet.
         </div>
      );
   }

   const pct = (value: number) => `${Math.round((value / total) * 100)}%`;
   const remaining = Math.max(0, total - started - completed);

   return (
      <div className="flex flex-col gap-2">
         <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div style={{ width: pct(completed), backgroundColor: COLORS.completed }} />
            <div style={{ width: pct(started), backgroundColor: COLORS.started }} />
         </div>
         <div className="flex justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
               <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: COLORS.completed }}
               />
               Completed {completed}
            </span>
            <span className="inline-flex items-center gap-1.5">
               <span className="size-2 rounded-full" style={{ backgroundColor: COLORS.started }} />
               Started {started}
            </span>
            <span className="inline-flex items-center gap-1.5">
               <span className="size-2 rounded-full" style={{ backgroundColor: COLORS.scope }} />
               Remaining {remaining}
            </span>
         </div>
      </div>
   );
}
