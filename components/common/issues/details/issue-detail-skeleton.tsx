import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder do detalhe da issue durante o fetch — evita o pulo de layout e a
 * percepção de lentidão de trocar a tela inteira por "Loading…". Reproduz a forma
 * de duas colunas (conteúdo + painel de propriedades).
 */
export function IssueDetailSkeleton() {
   return (
      <div className="@container h-full w-full overflow-hidden">
         <div className="mx-auto grid h-full w-full grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_16rem] @3xl:gap-6 @5xl:grid-cols-[minmax(0,1fr)_20rem] @7xl:max-w-[1247px] @7xl:grid-cols-[minmax(0,791px)_400px] @7xl:gap-14">
            <div className="flex min-w-0 flex-col gap-6 overflow-hidden px-8 py-10 @7xl:px-0 @7xl:pt-[59px]">
               <Skeleton className="h-8 w-3/4" />
               <div className="mt-2 flex flex-col gap-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-2/3" />
               </div>
            </div>
            <div className="hidden flex-col gap-5 overflow-hidden px-4 py-5 @3xl:flex @5xl:px-5 @5xl:py-6 @7xl:px-0 @7xl:pt-[21px]">
               {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                     <Skeleton className="h-3 w-16" />
                     <Skeleton className="h-6 w-32" />
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
}
