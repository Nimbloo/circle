'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';

/**
 * Hidrata os stores de domínio a partir da API no mount (client-side).
 * Se a API falhar, o store mantém o estado inicial (mock) — degradação graciosa.
 */
export function DataHydrator() {
   useEffect(() => {
      useIssuesStore.getState().hydrate();
   }, []);
   return null;
}
