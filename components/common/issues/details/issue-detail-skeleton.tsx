import { DetailSidePanel } from '@/components/common/detail-side-panel';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder do detalhe da issue durante o fetch — evita o pulo de layout e a
 * percepção de lentidão de trocar a tela inteira por "Loading…". Reproduz a forma
 * de duas colunas (conteúdo + painel de propriedades) do `IssueDetailView`.
 */
export function IssueDetailSkeleton() {
   return (
      <div className="flex h-full w-full overflow-hidden">
         <div className="h-full min-w-0 flex-1 overflow-hidden px-5 py-8 sm:px-8 sm:py-10 xl:pt-[59px]">
            <div className="mx-auto flex w-full max-w-[791px] flex-col gap-6">
               <Skeleton className="h-8 w-3/4" />
               <div className="mt-2 flex flex-col gap-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-2/3" />
               </div>
            </div>
         </div>
         <DetailSidePanel kind="issue" title="Issue details">
            <div className="flex w-full flex-col gap-5 overflow-hidden px-5 py-5 xl:pt-[21px]">
               {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                     <Skeleton className="h-3 w-16" />
                     <Skeleton className="h-6 w-32" />
                  </div>
               ))}
            </div>
         </DetailSidePanel>
      </div>
   );
}
