'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useLiveSync } from '@/lib/use-live-sync';
import { startUserSettingsSync } from '@/lib/user-settings-sync';
import { PreferencesApplier } from '@/components/layout/preferences-applier';

/**
 * Hidrata os stores de domínio a partir da API no mount (client-side).
 * Se o hydrate das issues falhar, o store seta `error: true` (não engole o erro):
 * o board mostra o estado de falha com botão "Tentar de novo". O estado inicial
 * (mock) é mantido como fallback de render.
 * O inbox depende das issues (o preview reusa a issue viva), então hidrata depois.
 *
 * Também abre o canal SSE (`useLiveSync`) para sincronização em tempo real: quando
 * OUTRO usuário muda algo, os stores afetados re-hidratam em ~1s sem refresh manual.
 */
export function DataHydrator() {
   useEffect(() => {
      useWorkspaceStore.getState().hydrate();
      void startUserSettingsSync();
      void useIssuesStore
         .getState()
         .hydrate()
         .then(() => useNotificationsStore.getState().hydrate());
   }, []);
   useLiveSync();
   return <PreferencesApplier />;
}
