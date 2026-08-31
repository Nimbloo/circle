'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { fetchReviews, syncReviews } from '@/lib/adapters-reviews';
import { Review, ReviewList, ReviewStatus } from '@/data/reviews';
import { ListFilter, RefreshCw, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ReviewDetail, ReviewSection } from './review-detail';
import { toast } from 'sonner';
import { PrIcon } from './review-shared';
import { Skeleton } from '@/components/ui/skeleton';

/** Hand-drawn empty-state sketch (paper plane over a folded sheet). */
function EmptySketch() {
   return (
      <svg width="150" height="120" viewBox="0 0 150 120" fill="none" aria-hidden>
         <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M28 78l58-22 34 30-64 16z" />
            <path d="M28 78l30-6 28 28" />
            <path d="M86 56l-8 40" strokeDasharray="4 4" />
            <path d="M104 34c8-10 22-12 26-6s-4 16-14 18" />
            <path d="M116 46c-4 2-8 2-12 0" />
            <path d="M44 66l6-2M56 84l6-2M70 92l6-2" strokeDasharray="3 4" />
         </g>
      </svg>
   );
}

const GROUP_LABELS: Record<ReviewStatus, string> = {
   open: 'Open',
   merged: 'Merged',
   closed: 'Closed',
};

/** Tamanho de página do load-more (alinhado ao default do backend). */
const PAGE_SIZE = 50;

function ReviewRow({
   review,
   orgId,
   selected,
}: {
   review: Review;
   orgId: string;
   selected: boolean;
}) {
   return (
      <Link
         href={`/${orgId}/review/${review.id}`}
         className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm border-b border-border/40 transition-colors',
            selected ? 'bg-accent/60' : 'hover:bg-sidebar/50'
         )}
      >
         <PrIcon status={review.status} />
         <span className="flex-1 truncate">{review.title}</span>
         <span className="text-xs text-muted-foreground shrink-0">{review.timeAgo}</span>
      </Link>
   );
}

/** Collapsible status group: the header arrow really opens and closes the rows. */
function ReviewGroup({
   label,
   count,
   children,
}: {
   label: string;
   count: number;
   children: ReactNode;
}) {
   const [open, setOpen] = useState(true);
   return (
      <div>
         <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="w-full flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-b border-border/40 cursor-pointer select-none"
         >
            {label}
            <svg
               width="8"
               height="8"
               viewBox="0 0 8 8"
               className={cn(
                  'text-muted-foreground transition-transform duration-200',
                  !open && '-rotate-90'
               )}
               aria-hidden
            >
               <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
            <span className="ml-auto text-muted-foreground font-normal">{count}</span>
         </button>
         <div
            className={cn(
               'grid transition-[grid-template-rows] duration-200 ease-out',
               open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
         >
            <div className="overflow-hidden">{children}</div>
         </div>
      </div>
   );
}

interface ReviewsProps {
   /** Which list tab is active ("/reviews" vs "/reviews/created"). */
   listTab?: ReviewList;
   /** Selected review (detail routes). */
   selectedReviewId?: string;
   section?: ReviewSection;
}

/** Reviews split view: list panel (For you / Created) + detail or empty state. */
export default function Reviews({
   listTab = 'for-you',
   selectedReviewId,
   section = 'overview',
}: ReviewsProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const [reviews, setReviews] = useState<Review[]>([]);
   const [total, setTotal] = useState(0);
   const [loading, setLoading] = useState(true);
   const [loadingMore, setLoadingMore] = useState(false);
   const [error, setError] = useState(false);
   const [syncing, setSyncing] = useState(false);
   const [reloadKey, setReloadKey] = useState(0);

   // Skeleton só na PRIMEIRA carga; o refetch do reloadKey (pós-sync) é silencioso —
   // a lista atual permanece na tela até a nova chegar (padrão stale-while-revalidate,
   // mesmo do issue-details). Falha de refetch também não derruba dados já exibidos.
   const loadedOnceRef = useRef(false);
   useEffect(() => {
      let active = true;
      if (!loadedOnceRef.current) setLoading(true);
      setError(false);
      fetchReviews({ limit: PAGE_SIZE, offset: 0 })
         .then((page) => {
            if (active) {
               loadedOnceRef.current = true;
               setReviews(page.reviews);
               setTotal(page.total);
            }
         })
         .catch(() => {
            if (active && !loadedOnceRef.current) {
               setReviews([]);
               setTotal(0);
               setError(true);
            }
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [reloadKey]);

   async function handleLoadMore() {
      setLoadingMore(true);
      try {
         const page = await fetchReviews({ limit: PAGE_SIZE, offset: reviews.length });
         setReviews((prev) => [...prev, ...page.reviews]);
         setTotal(page.total);
      } catch {
         // NÃO setError: o estado de erro troca a LISTA inteira pela mensagem —
         // falha do "carregar mais" não pode apagar o que já está na tela.
         toast.error('Não deu pra carregar mais reviews');
      } finally {
         setLoadingMore(false);
      }
   }

   async function handleSync() {
      setSyncing(true);
      try {
         await syncReviews(); // servidor dispara a ingestão em background
         toast.success('Sincronização iniciada — os PRs aparecem em instantes');
         // Re-busca após uma janela (o sync de ~86 repos roda no servidor, não bloqueia).
         setTimeout(() => setReloadKey((key) => key + 1), 6000);
      } catch {
         toast.error('Falha ao iniciar a sincronização');
         setError(true);
      } finally {
         setSyncing(false);
      }
   }

   // O backend não modela For you / Created (PRs crus do GitHub); ambas as abas
   // refletem o mesmo conjunto sincronizado.
   const source = reviews;

   const groups = (['open', 'merged', 'closed'] as ReviewStatus[])
      .map((status) => ({
         label: status === 'merged' && listTab === 'for-you' ? 'Completed' : GROUP_LABELS[status],
         items: source.filter((review) => review.status === status),
      }))
      .filter((group) => group.items.length > 0);

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="w-[420px] max-w-[45%] shrink-0 border-r h-full flex flex-col bg-container">
            <div className="flex items-center justify-between px-4 py-1.5 h-10 border-b shrink-0">
               <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <span className="text-sm font-medium">Reviews</span>
               </div>
               <div className="flex items-center gap-2 text-muted-foreground">
                  <ListFilter className="size-4" />
                  <SlidersHorizontal className="size-4" />
               </div>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 shrink-0">
               <Link
                  href={`/${orgId}/reviews`}
                  className={cn(
                     'px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
                     listTab === 'for-you'
                        ? 'bg-accent border-transparent'
                        : 'text-muted-foreground hover:bg-accent/50'
                  )}
               >
                  For you
               </Link>
               <Link
                  href={`/${orgId}/reviews/created`}
                  className={cn(
                     'px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
                     listTab === 'created'
                        ? 'bg-accent border-transparent'
                        : 'text-muted-foreground hover:bg-accent/50'
                  )}
               >
                  Created
               </Link>
            </div>
            <div className="flex-1 overflow-y-auto">
               {loading ? (
                  <div className="flex flex-col divide-y divide-border/50">
                     {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                           <Skeleton className="size-4 rounded-full shrink-0" />
                           <Skeleton className="h-4 flex-1 max-w-md" />
                           <Skeleton className="h-4 w-16 shrink-0" />
                        </div>
                     ))}
                  </div>
               ) : error ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                     Could not load reviews.
                  </div>
               ) : groups.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">No reviews yet.</div>
               ) : (
                  <>
                     {groups.map((group) => (
                        <ReviewGroup
                           key={group.label}
                           label={group.label}
                           count={group.items.length}
                        >
                           {group.items.map((review) => (
                              <ReviewRow
                                 key={review.id}
                                 review={review}
                                 orgId={orgId}
                                 selected={review.id === selectedReviewId}
                              />
                           ))}
                        </ReviewGroup>
                     ))}
                     <div className="flex flex-col items-center gap-2 px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                           {reviews.length} de {total}
                        </span>
                        {reviews.length < total && (
                           <button
                              type="button"
                              onClick={handleLoadMore}
                              disabled={loadingMore}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium hover:bg-accent/50 transition-colors disabled:opacity-60"
                           >
                              {loadingMore ? 'Carregando…' : 'Carregar mais'}
                           </button>
                        )}
                     </div>
                  </>
               )}
            </div>
         </div>

         <div className="flex-1 min-w-0 h-full overflow-hidden">
            {selectedReviewId ? (
               <ReviewDetail reviewId={selectedReviewId} section={section} />
            ) : (
               <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                  <EmptySketch />
                  <span className="text-sm">
                     {loading ? 'Loading…' : error ? 'Could not load reviews.' : `${total} reviews`}
                  </span>
                  {isAdmin && (
                     <button
                        type="button"
                        onClick={handleSync}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium hover:bg-accent/50 transition-colors disabled:opacity-60"
                     >
                        <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
                        {syncing ? 'Syncing…' : 'Sync from GitHub'}
                     </button>
                  )}
               </div>
            )}
         </div>
      </div>
   );
}
