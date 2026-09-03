'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { api } from '@/lib/client';
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

// `review_comment` não tem store: só o detalhe do review aberto reage (REVIEW_CHANGED_EVENT).
const TARGET_BY_ENTITY: Partial<Record<CircleEntity, SyncTarget>> = {
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
   // Refetch de SSE: pula o rollover de cycles (escrita) — só o boot da página o faz.
   else if (target === 'workspace') void useWorkspaceStore.getState().hydrate({ rollover: false });
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
/**
 * Evento de janela emitido quando a thread de um review muda (comentário/veredito de
 * OUTRO usuário). `detail.id` é o id do review; o detalhe aberto compara e refaz o fetch.
 */
export const REVIEW_CHANGED_EVENT = 'circle:review-changed';

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
            } else if ((entity === 'project' || entity === 'initiative') && parsed.id) {
               // TARGETED p/ project/initiative (o caso QUENTE — toda edição de detalhe/
               // milestone publica project/updated): re-busca SÓ aquela entidade e faz
               // apply, em vez de re-hidratar o workspace INTEIRO (que ainda roda o
               // rollover de cycles). `created` entra aqui também: `applyProject`/
               // `applyInitiative` INSEREM quando o id ainda não está no store, então
               // criar um projeto nao precisa custar um bootstrap inteiro por cliente.
               const ws = useWorkspaceStore.getState();
               const id = parsed.id;
               if (parsed.action === 'deleted') {
                  if (entity === 'project') ws.removeProjectLocal(id);
                  else ws.removeInitiativeLocal(id);
               } else if (entity === 'project') {
                  api.projects
                     .get(id)
                     .then(ws.applyProject)
                     .catch(() => scheduleHydrate('workspace')); // 404/erro → reconcilia
               } else {
                  api.initiatives
                     .get(id)
                     .then(ws.applyInitiative)
                     .catch(() => scheduleHydrate('workspace'));
               }
            } else if (entity === 'review_comment') {
               // Sem store de reviews: o detalhe aberto (review-detail) escuta e recarrega
               // só se for o mesmo review (o `id` do evento é o do review).
               window.dispatchEvent(
                  new CustomEvent(REVIEW_CHANGED_EVENT, { detail: { id: parsed.id } })
               );
            } else if (entity !== 'comment') {
               // 'comment' (e reactions, que publicam como comment) NÃO mexem na lista do
               // board — só no detalhe/feed da issue aberta, que é atualizado via o
               // ISSUE_CHANGED_EVENT abaixo. Re-hidratar o board inteiro aqui era puro
               // desperdício (re-scan de todas as issues por cliente a cada comentário).
               const target = TARGET_BY_ENTITY[entity];
               if (target) scheduleHydrate(target);
            }

            // Detalhe/feed aberto (cross-usuário): avisa o painel de detalhe pra refazer
            // seu próprio fetch (comments/activity não vivem no issues-store).
            // Para 'issue', parsed.id É o issueId (recarrega só o detalhe daquela issue).
            // Para 'comment'/'reaction', parsed.id é o COMMENT id — inútil pro guard do
            // painel (que compara com issue.id); manda undefined → qualquer detalhe
            // aberto recarrega (senão comentário de outro usuário nunca aparecia).
            if (DETAIL_ENTITIES.has(entity)) {
               window.dispatchEvent(
                  new CustomEvent(ISSUE_CHANGED_EVENT, {
                     detail: { id: entity === 'issue' ? parsed.id : undefined },
                  })
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
