'use client';

import React from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Falha do bootstrap do workspace (#16): sem isto a tela ficava no skeleton para sempre.
 * Enquanto nada carregou e o último bootstrap falhou, mostra o erro com retry; depois
 * de carregado uma vez, uma falha de refetch não derruba a tela (os dados seguem).
 */
export function WorkspaceLoadGate({ children }: { children: React.ReactNode }) {
   const failed = useWorkspaceStore((s) => s.loadError && !s.loaded);
   const loading = useWorkspaceStore((s) => s.loading);
   if (!failed) return <>{children}</>;
   return (
      <ErrorState
         className="min-h-full"
         title="Não foi possível carregar o workspace"
         description="Verifique a conexão e tente de novo."
         action={
            <Button
               size="sm"
               variant="outline"
               disabled={loading}
               onClick={() => void useWorkspaceStore.getState().hydrate()}
            >
               Tentar de novo
            </Button>
         }
      />
   );
}
