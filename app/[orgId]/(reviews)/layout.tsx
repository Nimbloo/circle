import { Suspense, type ReactNode } from 'react';
import { ReviewsShell } from '@/components/common/reviews/reviews-shell';

/**
 * Layout COMPARTILHADO de `/reviews`, `/reviews/created` e `/review/<id>[/review|/changes]`
 * (#8/R5). A tela inteira (lista + detalhe) mora aqui e deriva a seleção da URL; as
 * páginas não renderizam nada. Assim navegar entre PRs, seções e abas não remonta a lista
 * nem refaz o detalhe.
 */
export default function ReviewsLayout({ children }: { children: ReactNode }) {
   return (
      <>
         <Suspense fallback={null}>
            <ReviewsShell />
         </Suspense>
         {children}
      </>
   );
}
