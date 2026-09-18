'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/common/error-state';
import MainLayout from '@/components/layout/main-layout';
import { Button } from '@/components/ui/button';

/**
 * Error boundary da árvore [orgId]. Captura throws em render dos segmentos
 * abaixo (board, inbox, reviews, settings) e evita a tela branca em prod.
 * `reset()` re-monta o segmento que falhou. Fica no mesmo frame do `MainLayout`
 * das páginas (o shell com sidebar vive no `[orgId]/layout`).
 */
export default function OrgError({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   useEffect(() => {
      // Superfície mínima de diagnóstico até haver telemetria (Sentry).
      console.error(error);
   }, [error]);

   return (
      <MainLayout>
         <ErrorState
            title="Não foi possível carregar esta página"
            description="Ocorreu um erro inesperado. Tente novamente para recarregar o conteúdo."
            action={<Button onClick={() => reset()}>Tentar de novo</Button>}
            className="h-full min-h-0"
         />
      </MainLayout>
   );
}
