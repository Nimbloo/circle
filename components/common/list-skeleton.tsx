import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder genérico de lista durante o fetch — evita o pulo de layout e a
 * percepção de lentidão de trocar a tela por "Loading…". `rows` controla a altura.
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
   return (
      <div className="flex flex-col divide-y divide-border/50">
         {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-3 px-3">
               <Skeleton className="size-4 rounded-full shrink-0" />
               <Skeleton className="h-4 flex-1 max-w-md" />
               <Skeleton className="h-4 w-16 shrink-0" />
            </div>
         ))}
      </div>
   );
}
