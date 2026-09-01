'use client';

import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export default function RootError({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   useEffect(() => {
      console.error(error);
   }, [error]);

   return (
      <ErrorState
         title="Não foi possível carregar o Circle"
         description="Ocorreu um erro inesperado. Tente novamente para recarregar esta página."
         action={<Button onClick={() => reset()}>Tentar de novo</Button>}
      />
   );
}
