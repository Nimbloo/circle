'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

const IssueMenuHostContext = createContext(false);

/** true dentro de um `IssueContextMenuHost`: a linha/card não monta o próprio menu. */
export function useInIssueMenuHost(): boolean {
   return useContext(IssueMenuHostContext);
}

/**
 * Menu de contexto ÚNICO da lista/board (R7). Antes cada linha montava um `ContextMenu`
 * com ~10 assinaturas de store; agora o clique direito descobre a issue pelo
 * `data-issue-id` mais próximo e o menu é um só. Fora de uma issue não abre.
 */
export function IssueContextMenuHost({ children }: { children: ReactNode }) {
   const [issueId, setIssueId] = useState<string | undefined>(undefined);
   return (
      <IssueMenuHostContext.Provider value={true}>
         <ContextMenu>
            <ContextMenuTrigger
               asChild
               onContextMenu={(e) => {
                  const target = e.target as HTMLElement | null;
                  const id = target?.closest('[data-issue-id]')?.getAttribute('data-issue-id');
                  if (!id) {
                     e.preventDefault(); // sem issue sob o cursor: o Radix não abre o menu
                     return;
                  }
                  setIssueId(id);
               }}
            >
               <div className="contents">{children}</div>
            </ContextMenuTrigger>
            <IssueContextMenu issueId={issueId} />
         </ContextMenu>
      </IssueMenuHostContext.Provider>
   );
}
