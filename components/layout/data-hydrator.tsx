'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Hidrata os stores de domínio a partir da API no mount (client-side).
 * Se a API falhar, os stores mantêm o estado inicial — degradação graciosa.
 */
export function DataHydrator() {
   useEffect(() => {
      useWorkspaceStore.getState().hydrate();
      useIssuesStore.getState().hydrate();
   }, []);
   return null;
}
