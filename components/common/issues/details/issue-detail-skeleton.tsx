import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder do detalhe da issue durante o fetch — evita o pulo de layout e a
 * percepção de lentidão de trocar a tela inteira por "Loading…". Reproduz a forma
 * de duas colunas (conteúdo + painel de propriedades).
 */
export function IssueDetailSkeleton() {
   return (
      <div className="flex h-full w-full overflow-hidden">
         {/* Coluna principal */}
         <div className="flex-1 min-w-0 px-8 py-6 flex flex-col gap-6">
            <Skeleton className="h-4 w-24" /> {/* identifier */}
            <Skeleton className="h-8 w-3/4" /> {/* título */}
            <div className="flex flex-col gap-3 mt-2">
               <Skeleton className="h-4 w-full" />
               <Skeleton className="h-4 w-11/12" />
               <Skeleton className="h-4 w-4/5" />
               <Skeleton className="h-4 w-2/3" />
            </div>
         </div>
         {/* Painel de propriedades */}
         <div className="w-72 shrink-0 border-l px-5 py-6 flex flex-col gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
               <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-32" />
               </div>
            ))}
         </div>
      </div>
   );
}
