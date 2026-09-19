'use client';

import { useEffect, useRef } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useCatalogStore } from '@/store/catalog-store';
import { api } from '@/lib/client';
import type { CircleEntity } from '@/lib/api/events';

/**
 * Sincronização em tempo real (estilo Linear). Abre um `EventSource` no endpoint SSE
 * e reage a cada `CircleEvent`. Monte UMA vez, num client component do layout (ver
 * `DataHydrator`).
 *
 * A reação é de DOIS tipos, e a diferença importa:
 *
 * - TARGETED, sempre que o evento traz `id` (issue, project, initiative, cycle,
 *   member, view, team, label): re-busca só aquela entidade e faz splice no store.
 *   É o que evita o "reload idiota" — re-hidratar o workspace inteiro (ou centenas de
 *   issues) em TODOS os clientes porque UMA coisa mudou.
 * - COARSE DEBOUNCED + JITTER, para o que não tem store próprio nem id útil (catalog,
 *   notification, evento sem id): re-hidrata o store afetado, que é idempotente. O
 *   jitter espalha a rajada de todos os clientes ao mesmo tempo.
 *
 * Telas com cache local (detalhe de projeto/initiative, documentos, automações,
 * detalhe de issue/review) escutam EVENTOS DE JANELA com o id (`useLiveReload`).
 *
 * Reconexão: um `open` que não é o primeiro (queda de rede, deploy) re-hidrata issues,
 * workspace e notificações — o que aconteceu durante a queda nunca chegaria.
 */

/** Alvo de refetch por entidade. */
type SyncTarget = 'issues' | 'workspace' | 'notifications';

const DEBOUNCE_MS = 400;
/** Jitter máximo somado ao debounce do refetch coarse (0–1,5 s). */
const JITTER_MS = 1500;

/**
 * Quanto tempo a aba pode ficar escondida antes de soltarmos o SSE.
 *
 * O stream segura UMA conexão por aba, para sempre. Em HTTP/1.1 — que é o que
 * `circle.nimbloo.ai` serve hoje, medido no navegador (`nextHopProtocol`) — o browser
 * permite ~6 conexões por origem: com 6 abas do Circle abertas, TODAS as vagas viram
 * stream e o app trava esperando conexão. Aba escondida não precisa de tempo real;
 * ao voltar, reconecta e re-hidrata para pegar o que perdeu.
 */
const HIDDEN_DISCONNECT_MS = 60_000;

/** Teto do backoff de reconexão. Sem ele, um deploy faz todo cliente voltar junto, de segundo em segundo. */
const MAX_BACKOFF_MS = 30_000;

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
   /** Issue dona do comentário/reação (campo aditivo do servidor; pode não vir). */
   issueId?: string;
   /** Time do recurso, quando o servidor informa (aditivo; pode não vir). */
   teamId?: string;
   /** Destinatário da notificação (aditivo; sem ele, todo cliente recarrega o inbox). */
   recipientId?: string;
}

/** `detail` dos eventos de janela: id do recurso e, se vier, o time. */
export interface LiveEventDetail {
   id?: string;
   teamId?: string;
}

/**
 * Evento de janela emitido quando algo que afeta uma issue muda (issue/comment/
 * reaction/relation). O painel de detalhe aberto (issue-details / issue-preview)
 * escuta e refaz seu próprio fetch — senão o detalhe/feed de OUTROS usuários não
 * atualiza (o issues-store só guarda a LISTA do board, não comments/activity).
 */
export const ISSUE_CHANGED_EVENT = 'circle:issue-changed';
/**
 * Evento de janela emitido quando a thread de um review muda (comentário/veredito de
 * OUTRO usuário). `detail.id` é o id do review; o detalhe aberto compara e refaz o fetch.
 */
export const REVIEW_CHANGED_EVENT = 'circle:review-changed';
/** Projeto mudou (`detail.id` = projeto): detalhe/feed aberto recarrega em silêncio. */
export const PROJECT_CHANGED_EVENT = 'circle:project-changed';
/** Initiative mudou (`detail.id` = initiative): feed/updates abertos recarregam. */
export const INITIATIVE_CHANGED_EVENT = 'circle:initiative-changed';
/** Documento mudou (`detail.id` = documento): a lista de documentos recarrega. */
export const DOCUMENT_CHANGED_EVENT = 'circle:document-changed';
/** Configuração de workflow do time (SLA/automações/catálogo) mudou. */
export const AUTOMATION_CHANGED_EVENT = 'circle:automation-changed';
/** Job de import do usuário mudou de estado (`detail.id` = job): a tela relê o job. */
export const IMPORT_JOB_EVENT = 'circle:import-job';

function dispatch(name: string, detail: LiveEventDetail): void {
   window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Tela com cache local escuta o evento de janela e recarrega EM SILÊNCIO. `filter`
 * restringe ao recurso aberto: `id`/`teamId` diferentes do evento são ignorados;
 * evento sem o campo (servidor antigo, evento coarse) recarrega por segurança.
 */
export function useLiveReload(event: string, filter: LiveEventDetail, reload: () => unknown): void {
   const reloadRef = useRef(reload);
   useEffect(() => {
      reloadRef.current = reload;
   });
   const { id, teamId } = filter;
   useEffect(() => {
      const on = (e: Event) => {
         const detail = ((e as CustomEvent<LiveEventDetail>).detail ?? {}) as LiveEventDetail;
         if (id && detail.id && detail.id !== id) return;
         if (teamId && detail.teamId && detail.teamId !== teamId) return;
         void reloadRef.current();
      };
      window.addEventListener(event, on);
      return () => window.removeEventListener(event, on);
   }, [event, id, teamId]);
}

/** Label criada/editada: recarrega SÓ os labels (catálogo) e reflete nas issues em memória. */
function syncLabels(changedId: string | undefined): Promise<void> {
   return api.labels.list().then((dtos) => {
      useCatalogStore.getState().setLabels(dtos);
      const changed = changedId ? dtos.find((d) => d.id === changedId) : undefined;
      if (changed) useIssuesStore.getState().patchLabel(changed);
   });
}

export function useLiveSync(): void {
   useEffect(() => {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

      const timers = new Map<SyncTarget, ReturnType<typeof setTimeout>>();

      const scheduleHydrate = (target: SyncTarget) => {
         const existing = timers.get(target);
         if (existing) clearTimeout(existing);
         timers.set(
            target,
            setTimeout(
               () => {
                  timers.delete(target);
                  hydrateTarget(target);
               },
               DEBOUNCE_MS + Math.random() * JITTER_MS
            )
         );
      };
      const resyncAll = () => {
         for (const alvo of ['issues', 'workspace', 'notifications'] as SyncTarget[])
            scheduleHydrate(alvo);
      };

      let source: EventSource | null = null;
      let closed = false;
      let tentativas = 0;
      /** Já abriu alguma vez: todo `open` seguinte é uma RE-conexão. */
      let jaAbriu = false;
      let ocioso: ReturnType<typeof setTimeout> | null = null;

      /** Fetch direcionado; falha (404/erro) reconcilia com o fallback. */
      const targeted = <T>(
         fetcher: () => Promise<T>,
         apply: (dto: T) => void,
         onError: () => void = () => scheduleHydrate('workspace')
      ) => {
         fetcher().then(apply).catch(onError);
      };

      const handle = (parsed: CircleEventLike) => {
         const entity = parsed.entity;
         if (!entity) return;
         const { id, action } = parsed;
         const deleted = action === 'deleted';
         const ws = useWorkspaceStore.getState();

         // O LISTEN deste pod reconectou: o que passou durante a queda não vai chegar.
         if ((entity as string) === 'resync') {
            resyncAll();
            return;
         }

         // NÃO pulamos por "ator sou eu": outras abas/dispositivos do mesmo usuário
         // não receberam o update otimista → precisam reconciliar com o servidor.
         switch (entity) {
            case 'issue':
               if (!id) scheduleHydrate('issues');
               else if (deleted) useIssuesStore.getState().removeRemote(id);
               else void useIssuesStore.getState().applyRemote(id); // created|updated
               // Para 'issue', o id É o da issue: recarrega só o detalhe dela.
               dispatch(ISSUE_CHANGED_EVENT, { id });
               return;
            case 'comment':
               // Comentário/reação NÃO mexem na lista do board — só no detalhe aberto.
               // Com `issueId` no payload recarrega só aquele detalhe; sem ele (servidor
               // antigo), qualquer detalhe aberto recarrega (o id do evento é o do
               // COMENTÁRIO, inútil para o guard do painel).
               dispatch(ISSUE_CHANGED_EVENT, { id: parsed.issueId });
               return;
            case 'project':
            case 'initiative': {
               const event =
                  entity === 'project' ? PROJECT_CHANGED_EVENT : INITIATIVE_CHANGED_EVENT;
               if (!id) {
                  scheduleHydrate('workspace');
                  dispatch(event, {});
                  return;
               }
               // `created` entra aqui também: `applyProject`/`applyInitiative` INSEREM
               // quando o id ainda não está no store.
               if (deleted) {
                  if (entity === 'project') ws.removeProjectLocal(id);
                  else ws.removeInitiativeLocal(id);
               } else if (entity === 'project') {
                  targeted(() => api.projects.get(id), ws.applyProject);
               } else {
                  targeted(() => api.initiatives.get(id), ws.applyInitiative);
               }
               dispatch(event, { id, teamId: parsed.teamId });
               return;
            }
            case 'cycle':
               if (!id) scheduleHydrate('workspace');
               else if (deleted) ws.removeCycleLocal(id);
               else targeted(() => api.cycles.get(id), ws.applyCycle);
               return;
            case 'member':
               // Evento endereçado (assinatura de issue, #35): só o destinatário relê o `me`.
               if (parsed.recipientId) {
                  if (parsed.recipientId !== useWorkspaceStore.getState().me?.id) return;
                  if (parsed.issueId) {
                     targeted(
                        () => api.me(),
                        ws.applyMe,
                        () => {}
                     );
                     return;
                  }
               }
               if (!id || deleted) scheduleHydrate('workspace');
               else targeted(() => api.members.get(id), ws.applyUser);
               return;
            case 'view':
               if (!id) scheduleHydrate('workspace');
               else if (deleted) ws.removeViewLocal(id);
               // View pessoal de OUTRO usuário responde 404: não é nossa, sai do store.
               else
                  targeted(
                     () => api.views.get(id),
                     ws.applyView,
                     () => ws.removeViewLocal(id)
                  );
               return;
            case 'team':
               if (!id) scheduleHydrate('workspace');
               else if (deleted) ws.removeTeamLocal(id);
               // Time fora do escopo (convidado) responde 404: nada a aplicar.
               else
                  targeted(
                     () => api.teams.get(id),
                     ws.applyTeam,
                     () => {}
                  );
               return;
            case 'label':
               if (id && deleted) {
                  useCatalogStore.getState().removeLabel(id);
                  useIssuesStore.getState().dropLabel(id);
               } else {
                  void syncLabels(id).catch(() => scheduleHydrate('workspace'));
               }
               return;
            case 'document':
               // Documentos não vivem no bootstrap: só a tela aberta recarrega.
               dispatch(DOCUMENT_CHANGED_EVENT, { id, teamId: parsed.teamId });
               return;
            case 'catalog':
               // Status/templates/SLA/emoji chegam pelo bootstrap (STATUS = colunas do board).
               scheduleHydrate('workspace');
               dispatch(AUTOMATION_CHANGED_EVENT, { id, teamId: parsed.teamId });
               return;
            case 'notification': {
               const me = useWorkspaceStore.getState().me?.id;
               if (parsed.recipientId && me && parsed.recipientId !== me) return;
               scheduleHydrate('notifications');
               return;
            }
            case 'import':
               // Endereçado ao dono (`recipientId`); só a tela de import escuta.
               dispatch(IMPORT_JOB_EVENT, { id });
               return;
            case 'review_comment':
            case 'review':
               // Sem store de reviews: quem escuta é a tela — o detalhe aberto recarrega
               // só se for o mesmo review (o `id` do evento é o do review).
               dispatch(REVIEW_CHANGED_EVENT, { id });
               return;
            default:
               // Entidade nova (ex.: automações) que ainda não tem tratamento próprio.
               if ((entity as string) === 'automation')
                  dispatch(AUTOMATION_CHANGED_EVENT, { id, teamId: parsed.teamId });
         }
      };

      const connect = () => {
         if (closed || source) return;
         source = new EventSource('/api/v1/events');
         source.onopen = () => {
            tentativas = 0;
            // Re-conexão: o que mudou durante a queda nunca vai chegar como evento.
            if (jaAbriu) resyncAll();
            jaAbriu = true;
         };

         source.onmessage = (ev: MessageEvent<string>) => {
            let parsed: CircleEventLike;
            try {
               parsed = JSON.parse(ev.data) as CircleEventLike;
            } catch {
               return;
            }
            handle(parsed);
         };

         source.onerror = () => {
            // O EventSource reconecta sozinho; só forçamos um novo se ele fechar de vez.
            if (source && source.readyState === EventSource.CLOSED && !closed) {
               source.close();
               source = null;
               // Backoff com jitter: no deploy, todos os clientes caem juntos — voltar
               // de 1 em 1 segundo, em uníssono, é uma enxurrada no pod que subiu.
               const espera = Math.min(1000 * 2 ** tentativas, MAX_BACKOFF_MS);
               tentativas += 1;
               setTimeout(connect, espera * (0.5 + Math.random() / 2));
            }
         };
      };

      connect();

      /**
       * Aba escondida solta o stream; ao voltar, reconecta E re-hidrata (o `open` da
       * nova conexão, por ser uma RE-conexão, agenda o resync).
       */
      const onVisibilidade = () => {
         if (document.visibilityState === 'hidden') {
            ocioso = setTimeout(() => {
               source?.close();
               source = null;
            }, HIDDEN_DISCONNECT_MS);
            return;
         }
         if (ocioso) {
            clearTimeout(ocioso);
            ocioso = null;
         }
         if (!source) {
            tentativas = 0;
            connect();
         }
      };
      document.addEventListener('visibilitychange', onVisibilidade);

      return () => {
         closed = true;
         document.removeEventListener('visibilitychange', onVisibilidade);
         if (ocioso) clearTimeout(ocioso);
         for (const t of timers.values()) clearTimeout(t);
         timers.clear();
         source?.close();
         source = null;
      };
   }, []);
}
