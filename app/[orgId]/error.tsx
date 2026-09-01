'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';

/**
 * Error boundary da árvore [orgId]. Captura throws em render dos segmentos
 * abaixo (board, inbox, reviews, settings) e evita a tela branca em prod.
 * `reset()` re-monta o segmento que falhou.
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
      <ErrorState
         title="Não foi possível carregar esta página"
         description="Ocorreu um erro inesperado. Tente novamente para recarregar o conteúdo."
         action={<Button onClick={() => reset()}>Tentar de novo</Button>}
         className="h-full min-h-0"
      />
   );
}
