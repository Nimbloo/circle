'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Hidrata os stores de domínio a partir da API no mount (client-side).
 * Se a API falhar, os stores mantêm o estado inicial — degradação graciosa.
 * O inbox depende das issues (o preview reusa a issue viva), então hidrata depois.
 */
export function DataHydrator() {
   useEffect(() => {
      useWorkspaceStore.getState().hydrate();
      void useIssuesStore
         .getState()
         .hydrate()
         .then(() => useNotificationsStore.getState().hydrate());
   }, []);
   return null;
}
