'use client';

import { useParams, usePathname, useSearchParams } from 'next/navigation';
import MainLayout from '@/components/layout/main-layout';
import type { ReviewList } from '@/data/reviews';
import Reviews from './reviews';
import type { ReviewSection } from './review-detail';

export interface ReviewsRoute {
   listTab: ReviewList;
   reviewId?: string;
   section: ReviewSection;
}

/** `decodeURIComponent` tolerante (o id `repo/name#n` chega codificado no segmento). */
function safeDecode(raw: string): string {
   try {
      return decodeURIComponent(raw);
   } catch {
      return raw;
   }
}

/**
 * Deriva a tela de reviews da URL: `/reviews` (For you), `/reviews/created`,
 * `/review/<id>` (overview), `/review/<id>/review` (guide), `/review/<id>/changes` (diff).
 * A aba da lista fica na URL também no detalhe (`?list=created`).
 */
export function parseReviewsRoute(
   pathname: string,
   rawReviewId: string | undefined,
   listParam: string | null
): ReviewsRoute {
   const segments = pathname.split('/').filter(Boolean);
   const at = segments.indexOf('review');
   const reviewId = rawReviewId ? safeDecode(rawReviewId) : undefined;
   const tail = at >= 0 ? segments[at + 2] : undefined;
   const section: ReviewSection =
      tail === 'changes' ? 'diff' : tail === 'review' ? 'guide' : 'overview';
   const listTab: ReviewList =
      segments.at(-1) === 'created' && segments.includes('reviews')
         ? 'created'
         : listParam === 'created'
           ? 'created'
           : 'for-you';
   return { listTab, reviewId: at >= 0 ? reviewId : undefined, section };
}

/**
 * Tela de reviews montada no LAYOUT das rotas de review (#8/R5): a lista e o detalhe
 * sobrevivem à navegação entre PRs, seções e abas — antes cada rota era uma página
 * própria e tudo remontava (refetch da lista, "carregar mais" perdido, Created virando
 * For you, detalhe rebaixando os patches a cada troca de seção).
 */
export function ReviewsShell() {
   const pathname = usePathname();
   const searchParams = useSearchParams();
   const params = useParams<{ reviewId?: string }>();
   const route = parseReviewsRoute(pathname, params.reviewId, searchParams.get('list'));
   return (
      <MainLayout>
         <Reviews
            listTab={route.listTab}
            selectedReviewId={route.reviewId}
            section={route.section}
         />
      </MainLayout>
   );
}
