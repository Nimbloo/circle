'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { CircleEntity } from '@/lib/api/events';

/**
 * Sincronização em tempo real (estilo Linear). Abre um `EventSource` no endpoint
 * SSE; a cada `CircleEvent`, dispara um refetch COARSE DEBOUNCED do store afetado.
 *
 * Grosso de propósito: o barramento só diz "algo do tipo X mudou" e o cliente
 * re-hidrata o store inteiro (idempotente). Simples e robusto para 1 réplica.
 * Monte UMA vez, num client component do layout (ver `DataHydrator`).
 */

/** Alvo de refetch por entidade. */
type SyncTarget = 'issues' | 'workspace' | 'notifications';

const TARGET_BY_ENTITY: Record<CircleEntity, SyncTarget> = {
   issue: 'issues',
   comment: 'issues',
   label: 'issues',
   cycle: 'workspace', // ciclos vivem no workspace-store (bootstrap), não no issues-store
   project: 'workspace',
   initiative: 'workspace',
   view: 'workspace',
   team: 'workspace',
   member: 'workspace',
   document: 'workspace',
   notification: 'notifications',
};

const DEBOUNCE_MS = 400;

function hydrateTarget(target: SyncTarget): void {
   if (target === 'issues') void useIssuesStore.getState().hydrate();
   else if (target === 'workspace') void useWorkspaceStore.getState().hydrate();
   else void useNotificationsStore.getState().hydrate();
}

interface CircleEventLike {
   entity?: CircleEntity;
   action?: string; // created|updated|deleted
   actorEmail?: string;
   id?: string;
}

/**
 * Evento de janela emitido quando algo que afeta uma issue muda (issue/comment/
 * reaction/relation). O painel de detalhe aberto (issue-details / issue-preview)
 * escuta e refaz seu próprio fetch — senão o detalhe/feed de OUTROS usuários não
 * atualiza (o issues-store só guarda a LISTA do board, não comments/activity).
 */
export const ISSUE_CHANGED_EVENT = 'circle:issue-changed';
/** Entidades cujo evento também mexe no detalhe/feed de uma issue. */
const DETAIL_ENTITIES = new Set<CircleEntity>(['issue', 'comment']);

export function useLiveSync(): void {
   useEffect(() => {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

      const timers = new Map<SyncTarget, ReturnType<typeof setTimeout>>();

      const scheduleHydrate = (target: SyncTarget) => {
         const existing = timers.get(target);
         if (existing) clearTimeout(existing);
         timers.set(
            target,
            setTimeout(() => {
               timers.delete(target);
               hydrateTarget(target);
            }, DEBOUNCE_MS)
         );
      };

      let source: EventSource | null = null;
      let closed = false;

      const connect = () => {
         if (closed) return;
         source = new EventSource('/api/v1/events');

         source.onmessage = (ev: MessageEvent<string>) => {
            let parsed: CircleEventLike;
            try {
               parsed = JSON.parse(ev.data) as CircleEventLike;
            } catch {
               return;
            }
            const entity = parsed.entity;
            if (!entity) return;

            // NÃO pulamos por "ator sou eu": outras abas/dispositivos do mesmo usuário
            // não receberam o update otimista → precisam reconciliar com o servidor.
            //
            // TARGETED (fim do "reload idiota"): um evento de ISSUE com id re-busca
            // SÓ aquela issue e faz splice (sem re-hidratar as ~500). O coarse debounced
            // fica só pra comment/label (id não é o da issue) e workspace/notifications.
            if (entity === 'issue' && parsed.id) {
               if (parsed.action === 'deleted') useIssuesStore.getState().removeRemote(parsed.id);
               else void useIssuesStore.getState().applyRemote(parsed.id); // created|updated
            } else {
               const target = TARGET_BY_ENTITY[entity];
               if (target) scheduleHydrate(target);
            }

            // Detalhe/feed aberto (cross-usuário): avisa o painel de detalhe pra refazer
            // seu próprio fetch (comments/activity não vivem no issues-store).
            if (DETAIL_ENTITIES.has(entity)) {
               window.dispatchEvent(
                  new CustomEvent(ISSUE_CHANGED_EVENT, { detail: { id: parsed.id } })
               );
            }
         };

         source.onerror = () => {
            // O EventSource reconecta sozinho; só forçamos um novo se ele fechar de vez.
            if (source && source.readyState === EventSource.CLOSED && !closed) {
               source.close();
               source = null;
               setTimeout(connect, 1000);
            }
         };
      };

      connect();

      return () => {
         closed = true;
         for (const t of timers.values()) clearTimeout(t);
         timers.clear();
         source?.close();
         source = null;
      };
   }, []);
}
