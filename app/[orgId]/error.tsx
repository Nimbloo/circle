'use client';

import { useEffect } from 'react';
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
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
         <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground max-w-md">
               Ocorreu um erro ao carregar esta página. Você pode tentar novamente.
            </p>
         </div>
         <Button onClick={() => reset()}>Tentar de novo</Button>
      </div>
   );
}
