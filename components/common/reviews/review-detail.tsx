'use client';

import { addReviewComment, fetchReview, latestVerdict } from '@/lib/adapters-reviews';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { LoadingArea } from '@/components/common/loading-area';
import { Button } from '@/components/ui/button';
import type { Review, ReviewComment, ReviewList, ReviewVerdictKind } from '@/data/reviews';
import { REVIEW_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check, CircleSlash } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type ReviewCommentsHandle, VerdictBadge } from './review-comments';
import { ReviewDiff } from './review-diff';
import { ReviewGuide } from './review-guide';
import { ReviewOverview } from './review-overview';
import { DiffStat, IssueCheckIcon, PrIcon } from './review-shared';

export type ReviewSection = 'overview' | 'guide' | 'diff';

/** Abas do detalhe; o path segue as rotas existentes (`/review`, `/changes`). */
const SECTIONS: { id: ReviewSection; label: string; path: string }[] = [
   { id: 'overview', label: 'Overview', path: '' },
   { id: 'guide', label: 'Guide', path: '/review' },
   { id: 'diff', label: 'Diff', path: '/changes' },
];

const VERDICT_TOAST: Record<ReviewVerdictKind, string> = {
   approve: 'Review approved',
   request_changes: 'Changes requested',
};

/**
 * Janela em que um evento do próprio review é tratado como ECO da ação local (comentário,
 * veredito) e não refaz o fetch do detalhe inteiro (#48). Evento de outra pessoa depois
 * dela recarrega normalmente.
 */
const OWN_ECHO_MS = 3000;
/** Coalescência dos eventos do review aberto (rajada de check_run/sync). */
const DETAIL_RELOAD_DEBOUNCE_MS = 300;

/** Right pane of the Reviews split view: breadcrumb, veredito, abas e a seção ativa do PR. */
export function ReviewDetail({
   reviewId,
   section = 'overview',
   listTab = 'for-you',
}: {
   reviewId: string;
   section?: ReviewSection;
   /** Aba da lista de origem — mantida nos links das seções (`?list=created`). */
   listTab?: ReviewList;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const me = useWorkspaceStore((s) => s.me);
   const [review, setReview] = useState<Review | null>(null);
   /** Falha de CARGA (rede/500) — diferente de "não existe" (co#11). */
   const [loadFailed, setLoadFailed] = useState(false);
   const [loading, setLoading] = useState(true);
   const [reloadKey, setReloadKey] = useState(0);
   const [verdictBusy, setVerdictBusy] = useState<ReviewVerdictKind | null>(null);

   useEffect(() => {
      let active = true;
      // Recarga por realtime não volta pro loading — só o 1º fetch (ou troca de review).
      if (reloadKey === 0) setLoading(true);
      setLoadFailed(false);
      fetchReview(reviewId)
         .then((data) => {
            if (active) setReview(data);
         })
         .catch((error: unknown) => {
            if (!active) return;
            const notFound =
               error instanceof Error &&
               error.name === 'ApiError' &&
               (error as { status?: number }).status === 404;
            // Rede fora não é "review não existe": mostra erro com retry e preserva o
            // que já estava na tela numa recarga.
            if (!notFound) setLoadFailed(true);
            else if (reloadKey === 0) setReview(null);
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [reviewId, reloadKey]);

   // Realtime: comentário/veredito de OUTRO usuário neste review → refaz o fetch
   // (coalescido; o eco da ação local, que já foi aplicada por splice, é ignorado).
   const ownMutationAtRef = useRef(0);
   useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (id && id !== reviewId) return;
         if (id && Date.now() - ownMutationAtRef.current < OWN_ECHO_MS) return;
         if (timer) clearTimeout(timer);
         timer = setTimeout(() => setReloadKey((k) => k + 1), DETAIL_RELOAD_DEBOUNCE_MS);
      };
      window.addEventListener(REVIEW_CHANGED_EVENT, onChanged);
      return () => {
         if (timer) clearTimeout(timer);
         window.removeEventListener(REVIEW_CHANGED_EVENT, onChanged);
      };
   }, [reviewId]);

   /** Splice na thread + recálculo do veredito, sem refetch (mutações do próprio usuário). */
   const mutateComments = useCallback((fn: (comments: ReviewComment[]) => ReviewComment[]) => {
      ownMutationAtRef.current = Date.now();
      setReview((current) => {
         if (!current) return current;
         const comments = fn(current.comments);
         return { ...current, comments, verdict: latestVerdict(comments) };
      });
   }, []);

   const handle = useMemo<ReviewCommentsHandle>(
      () => ({ reviewId, meId: me?.id, isAdmin: !!me?.admin, mutate: mutateComments }),
      [reviewId, me?.id, me?.admin, mutateComments]
   );

   const submitVerdict = async (kind: ReviewVerdictKind) => {
      if (verdictBusy) return;
      setVerdictBusy(kind);
      try {
         const created = await addReviewComment(reviewId, { body: '', kind });
         mutateComments((cs) => [...cs, created]);
         toast.success(VERDICT_TOAST[kind]);
      } catch {
         toast.error(
            kind === 'approve' ? 'Could not approve the review' : 'Could not request changes'
         );
      } finally {
         setVerdictBusy(null);
      }
   };

   if (loading) return <LoadingArea rows={6} />;

   if (!review) {
      return loadFailed ? (
         <ErrorState
            title="Could not load the review"
            description="Something went wrong while loading this pull request."
            className="min-h-0 px-4 py-10"
            action={
               <Button size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                  Try again
               </Button>
            }
         />
      ) : (
         <EmptyState
            variant="search"
            title="Review not found"
            description="It may have been removed or you don't have access to it."
         />
      );
   }

   return (
      <div className="content-enter h-full flex flex-col overflow-hidden">
         <div className="flex items-center gap-2 px-4 h-11 border-b shrink-0 min-w-0">
            {/* Só linka pra issue quando o PR resolve uma (título com [ABC-123]);
                senão o link ia pra /issue/ (morto). */}
            {review.resolves.identifier && (
               <>
                  <Link
                     href={`/${orgId}/issue/${review.resolves.identifier}`}
                     className="flex items-center gap-1.5 shrink-0 hover:opacity-80"
                  >
                     <IssueCheckIcon />
                     <span className="text-sm font-medium">{review.resolves.identifier}</span>
                  </Link>
                  <span className="text-muted-foreground text-xs shrink-0">›</span>
               </>
            )}
            <PrIcon status={review.status} />
            <span className="text-sm font-medium truncate">{review.title}</span>
            <DiffStat additions={review.additions} deletions={review.deletions} />
            {review.verdict && <VerdictBadge kind={review.verdict.kind} className="shrink-0" />}
            <span className="flex-1" />
            {review.status === 'open' && (
               <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <Button
                     size="xxs"
                     variant="ghost"
                     onClick={() => void submitVerdict('request_changes')}
                     disabled={verdictBusy !== null}
                     className="text-muted-foreground hover:text-foreground"
                  >
                     <CircleSlash className="size-3.5" />
                     Request changes
                  </Button>
                  <Button
                     size="xxs"
                     variant="outline"
                     onClick={() => void submitVerdict('approve')}
                     disabled={verdictBusy !== null}
                  >
                     <Check className="size-3.5" />
                     Approve
                  </Button>
               </div>
            )}
            <nav aria-label="Review sections" className="flex items-center gap-1 shrink-0">
               {SECTIONS.map((candidate) => (
                  <Link
                     key={candidate.id}
                     href={`/${orgId}/review/${encodeURIComponent(reviewId)}${candidate.path}${
                        listTab === 'created' ? '?list=created' : ''
                     }`}
                     aria-current={section === candidate.id ? 'page' : undefined}
                     className={cn(
                        'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
                        section === candidate.id
                           ? 'bg-accent border-transparent'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {candidate.label}
                  </Link>
               ))}
            </nav>
         </div>
         <div className="flex-1 min-h-0 overflow-hidden">
            {section === 'diff' ? (
               <ReviewDiff review={review} handle={handle} />
            ) : section === 'guide' ? (
               <ReviewGuide review={review} />
            ) : (
               <ReviewOverview review={review} handle={handle} />
            )}
         </div>
      </div>
   );
}
