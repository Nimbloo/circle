'use client';

import { useEffect, useRef } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import {
   isNotificationPatch,
   useNotificationsStore,
   type NotificationEvent,
} from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useCatalogStore } from '@/store/catalog-store';
import { useFavoritesStore } from '@/store/favorites-store';
import { api, ApiError } from '@/lib/client';
import { isFromThisTab, isOwnEcho } from '@/lib/client-id';
import { isSessionEnded } from '@/lib/session-redirect';
import { invalidateCustomEmojis } from '@/hooks/use-custom-emojis';
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
 * Reconexão: um `open` que não é o primeiro (queda de rede, deploy) re-sincroniza issues
 * (delta incremental, #14), workspace e notificações — e avisa as telas com cache local
 * por evento de janela. O que aconteceu durante a queda nunca chegaria.
 *
 * Fetch direcionado COALESCIDO e SEQUENCIADO (#11): eventos da mesma entidade numa
 * janela curta viram UM GET; resposta de um GET mais velho que outro já disparado para
 * a mesma chave é descartada; rajada acima de `COARSE_THRESHOLD` ids vira 1 hidratação.
 *
 * Eco da própria aba (If#16): evento com o `clientId` desta aba para uma entidade cuja
 * mutação já aplicou o DTO da resposta não refaz o GET. Os eventos de janela levam
 * `own: true` para a tela decidir (ver `useLiveReload(..., { ignoreOwn })`).
 */

/** Alvo de refetch por entidade. */
type SyncTarget = 'issues' | 'workspace' | 'notifications';

const DEBOUNCE_MS = 400;
/** Jitter máximo somado ao debounce do refetch coarse (0–1,5 s). */
const JITTER_MS = 1500;
/**
 * Jitter do resync avisado pelo POD (LISTEN reconectou): TODOS os clientes do pod
 * recebem o aviso no mesmo instante — espalhar mais evita a enxurrada no banco.
 */
const POD_RESYNC_JITTER_MS = 6000;
/** Janela de coalescência do fetch direcionado. */
const COALESCE_MS = 200;
/** Acima disso, numa janela, o grupo vira UMA hidratação (bulk de 50 issues = 1 delta). */
const COARSE_THRESHOLD = 20;

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
   // Delta incremental (#14): cai na hidratação completa sozinho quando precisa.
   if (target === 'issues') void useIssuesStore.getState().resync();
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
   /** Aba que originou a mutação (If#16). */
   clientId?: string;
   /** `content`: só o conteúdo (descrição) mudou — o DTO da lista não (#18). */
   scope?: 'content';
   /** Subtipo do `catalog` (#53; aditivo). Ausente = dado do bootstrap (status). */
   kind?: string;
}

/** `detail` dos eventos de janela: id do recurso e, se vier, o time. */
export interface LiveEventDetail {
   id?: string;
   teamId?: string;
   /** A mutação saiu DESTA aba (eco): a tela que já aplicou a resposta pode ignorar. */
   own?: boolean;
   /** Subtipo do `catalog` (#53): template, project_template, sla, emoji. */
   kind?: string;
}

/** Todos os eventos de janela: um resync avisa todas as telas com cache local. */
const WINDOW_EVENTS = [
   'circle:issue-changed',
   'circle:review-changed',
   'circle:project-changed',
   'circle:initiative-changed',
   'circle:document-changed',
   'circle:automation-changed',
] as const;

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
/**
 * Dado de catálogo FORA do bootstrap mudou (#53) — `detail.kind` diz qual (template,
 * project_template). A tela que o exibe recarrega; o bootstrap não é refeito.
 */
export const CATALOG_CHANGED_EVENT = 'circle:catalog-changed';
/** Time mudou (`detail.id` = `detail.teamId` = time): ex. fila de solicitações de entrada (#58). */
export const TEAM_CHANGED_EVENT = 'circle:team-changed';
/** Job de import do usuário mudou de estado (`detail.id` = job): a tela relê o job. */
export const IMPORT_JOB_EVENT = 'circle:import-job';

function dispatch(name: string, detail: LiveEventDetail): void {
   window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Tela com cache local escuta o evento de janela e recarrega EM SILÊNCIO. `filter`
 * restringe ao recurso aberto: `id`/`teamId` diferentes do evento são ignorados;
 * evento sem o campo (servidor antigo, evento coarse, resync) recarrega por segurança.
 * `ignoreOwn`: a tela já aplica a resposta das próprias mutações — o eco desta aba
 * não recarrega (If#16).
 */
export function useLiveReload(
   event: string,
   filter: LiveEventDetail,
   reload: () => unknown,
   options: { ignoreOwn?: boolean } = {}
): void {
   const reloadRef = useRef(reload);
   useEffect(() => {
      reloadRef.current = reload;
   });
   const { id, teamId, kind } = filter;
   const { ignoreOwn = false } = options;
   useEffect(() => {
      const on = (e: Event) => {
         const detail = ((e as CustomEvent<LiveEventDetail>).detail ?? {}) as LiveEventDetail;
         if (id && detail.id && detail.id !== id) return;
         if (teamId && detail.teamId && detail.teamId !== teamId) return;
         if (ignoreOwn && detail.own) return;
         if (kind && detail.kind && detail.kind !== kind) return;
         void reloadRef.current();
      };
      window.addEventListener(event, on);
      return () => window.removeEventListener(event, on);
   }, [event, id, teamId, kind, ignoreOwn]);
}

/** Label criada/editada: aplica a lista (catálogo) e reflete nas issues em memória. */
function applyLabels(dtos: { id: string; name: string; color: string }[], changed: Set<string>) {
   useCatalogStore.getState().setLabels(dtos);
   for (const d of dtos) if (changed.has(d.id)) useIssuesStore.getState().patchLabel(d);
}

/** GET de uma issue com UMA nova tentativa em erro transitório (404 não repete). */
async function fetchIssue(id: string) {
   try {
      return await api.issues.get(id);
   } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) throw e;
      return api.issues.get(id);
   }
}

/** Fetch direcionado na fila de coalescência. */
interface TargetedJob<T = unknown> {
   /** Grupo que vira hidratação coarse numa rajada. */
   group: SyncTarget;
   fetch: () => Promise<T>;
   apply: (dto: T) => void;
   onError: (e: unknown) => void;
}

export function useLiveSync(): void {
   useEffect(() => {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

      const timers = new Map<SyncTarget, ReturnType<typeof setTimeout>>();
      let closed = false;

      const scheduleHydrate = (target: SyncTarget, jitter = JITTER_MS) => {
         const existing = timers.get(target);
         if (existing) clearTimeout(existing);
         timers.set(
            target,
            setTimeout(
               () => {
                  timers.delete(target);
                  hydrateTarget(target);
               },
               DEBOUNCE_MS + Math.random() * jitter
            )
         );
      };
      /** Telas com cache local (detalhes, documentos, automações) recarregam no resync. */
      let windowTimer: ReturnType<typeof setTimeout> | null = null;
      const resyncAll = (jitter = JITTER_MS) => {
         for (const alvo of ['issues', 'workspace', 'notifications'] as SyncTarget[])
            scheduleHydrate(alvo, jitter);
         if (windowTimer) clearTimeout(windowTimer);
         windowTimer = setTimeout(
            () => {
               windowTimer = null;
               for (const name of WINDOW_EVENTS) dispatch(name, {});
            },
            DEBOUNCE_MS + Math.random() * jitter
         );
      };

      /* ---------------- Fetch direcionado: coalescido e sequenciado (#11) ---------------- */
      const pending = new Map<string, TargetedJob>();
      const seqByKey = new Map<string, number>();
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
         flushTimer = null;
         const jobs = [...pending];
         pending.clear();
         const perGroup = new Map<SyncTarget, number>();
         for (const [, job] of jobs) perGroup.set(job.group, (perGroup.get(job.group) ?? 0) + 1);
         for (const [key, job] of jobs) {
            // Rajada (bulk, import): uma hidratação do grupo em vez de N GETs.
            if ((perGroup.get(job.group) ?? 0) > COARSE_THRESHOLD) {
               seqByKey.set(key, (seqByKey.get(key) ?? 0) + 1); // invalida GET em voo
               continue;
            }
            const n = (seqByKey.get(key) ?? 0) + 1;
            seqByKey.set(key, n);
            job.fetch().then(
               (dto) => {
                  if (!closed && seqByKey.get(key) === n) job.apply(dto);
               },
               (e) => {
                  if (!closed && seqByKey.get(key) === n) job.onError(e);
               }
            );
         }
         for (const [group, count] of perGroup)
            if (count > COARSE_THRESHOLD) scheduleHydrate(group);
      };
      const enqueue = <T>(key: string, job: TargetedJob<T>) => {
         pending.set(key, job as TargetedJob);
         if (!flushTimer) flushTimer = setTimeout(flush, COALESCE_MS);
      };
      /** Labels alterados desde o último GET da lista (a lista é um GET só). */
      const changedLabels = new Set<string>();

      let source: EventSource | null = null;
      let tentativas = 0;
      /** Já abriu alguma vez: todo `open` seguinte é uma RE-conexão. */
      let jaAbriu = false;
      let ocioso: ReturnType<typeof setTimeout> | null = null;

      /** Fetch direcionado de entidade do workspace; falha reconcilia com o fallback. */
      const targeted = <T>(
         key: string,
         fetcher: () => Promise<T>,
         apply: (dto: T) => void,
         onError: () => void = () => scheduleHydrate('workspace')
      ) => {
         enqueue(key, { group: 'workspace', fetch: fetcher, apply, onError });
      };

      const handle = (parsed: CircleEventLike) => {
         const entity = parsed.entity;
         if (!entity) return;
         const { id, action } = parsed;
         const deleted = action === 'deleted';
         const ws = useWorkspaceStore.getState();
         // Eco da própria aba (If#16): a tela decide; o store já tem o DTO da resposta.
         const own = isFromThisTab(parsed);
         const ownEcho = isOwnEcho(parsed);

         // NÃO pulamos por "ator sou eu": outras abas/dispositivos do mesmo usuário
         // não receberam o update otimista → precisam reconciliar com o servidor.
         // Favorito renomeado/apagado: a sidebar acompanha (só se a entidade é favorita).
         if (id && (entity === 'issue' || entity === 'project' || entity === 'view'))
            useFavoritesStore.getState().onEntityChanged(entity, id);

         switch (entity) {
            case 'resync':
               // O LISTEN deste pod reconectou: o que passou durante a queda não vai chegar.
               resyncAll(POD_RESYNC_JITTER_MS);
               return;
            case 'favorite':
               // Favorito mudou em outra aba/dispositivo do próprio usuário.
               if (parsed.recipientId && parsed.recipientId !== ws.me?.id) return;
               void useFavoritesStore.getState().refresh();
               return;
            case 'issue': {
               if (!id) scheduleHydrate('issues');
               else if (deleted) useIssuesStore.getState().removeRemote(id);
               // Só o conteúdo (descrição) mudou: o DTO da lista é o mesmo (#18).
               else if (parsed.scope === 'content' || ownEcho) {
                  /* nada a buscar */
               } else
                  enqueue(`issue:${id}`, {
                     group: 'issues',
                     fetch: () => fetchIssue(id),
                     apply: (dto) => useIssuesStore.getState().applyDto(dto),
                     onError: (e) => {
                        // Apagada ou fora do escopo: sai do store (If#23), sem hidratar tudo.
                        if (e instanceof ApiError && (e.status === 404 || e.status === 403))
                           useIssuesStore.getState().removeRemote(id);
                     },
                  });
               // Para 'issue', o id É o da issue: recarrega só o detalhe dela.
               dispatch(ISSUE_CHANGED_EVENT, own ? { id, own } : { id });
               return;
            }
            case 'comment':
               // Comentário/reação NÃO mexem na lista do board — só no detalhe aberto.
               // Com `issueId` no payload recarrega só aquele detalhe; sem ele (servidor
               // antigo), qualquer detalhe aberto recarrega (o id do evento é o do
               // COMENTÁRIO, inútil para o guard do painel).
               dispatch(
                  ISSUE_CHANGED_EVENT,
                  own ? { id: parsed.issueId, own } : { id: parsed.issueId }
               );
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
               } else if (ownEcho) {
                  /* a resposta da mutação já entrou no store */
               } else if (entity === 'project') {
                  targeted(
                     `project:${id}`,
                     () => api.projects.get(id),
                     (dto) => useWorkspaceStore.getState().applyProject(dto)
                  );
               } else {
                  targeted(
                     `initiative:${id}`,
                     () => api.initiatives.get(id),
                     (dto) => useWorkspaceStore.getState().applyInitiative(dto)
                  );
               }
               dispatch(
                  event,
                  own ? { id, teamId: parsed.teamId, own } : { id, teamId: parsed.teamId }
               );
               return;
            }
            case 'cycle':
               if (!id) scheduleHydrate('workspace');
               else if (deleted) ws.removeCycleLocal(id);
               else
                  targeted(
                     `cycle:${id}`,
                     () => api.cycles.get(id),
                     (dto) => useWorkspaceStore.getState().applyCycle(dto)
                  );
               return;
            case 'member':
               // Evento endereçado (assinatura de issue, #35): só o destinatário relê o `me`.
               if (parsed.recipientId) {
                  if (parsed.recipientId !== useWorkspaceStore.getState().me?.id) return;
                  if (parsed.issueId) {
                     targeted(
                        'me',
                        () => api.me(),
                        (dto) => useWorkspaceStore.getState().applyMe(dto),
                        () => {}
                     );
                     return;
                  }
               }
               if (!id || deleted) scheduleHydrate('workspace');
               else
                  targeted(
                     `member:${id}`,
                     () => api.members.get(id),
                     (dto) => useWorkspaceStore.getState().applyUser(dto)
                  );
               return;
            case 'view':
               if (!id) scheduleHydrate('workspace');
               else if (deleted) ws.removeViewLocal(id);
               // View pessoal de OUTRO usuário responde 404: não é nossa, sai do store.
               else
                  targeted(
                     `view:${id}`,
                     () => api.views.get(id),
                     (dto) => useWorkspaceStore.getState().applyView(dto),
                     () => useWorkspaceStore.getState().removeViewLocal(id)
                  );
               return;
            case 'team':
               if (id) dispatch(TEAM_CHANGED_EVENT, { id, teamId: id });
               if (!id) scheduleHydrate('workspace');
               else if (deleted) ws.removeTeamLocal(id);
               // Time fora do escopo (convidado) responde 404: nada a aplicar.
               else
                  targeted(
                     `team:${id}`,
                     () => api.teams.get(id),
                     (dto) => useWorkspaceStore.getState().applyTeam(dto),
                     () => {}
                  );
               return;
            case 'label':
               if (id && deleted) {
                  useCatalogStore.getState().removeLabel(id);
                  useIssuesStore.getState().dropLabel(id);
               } else {
                  if (id) changedLabels.add(id);
                  // A lista de labels é um GET só: rajada de eventos vira uma leitura.
                  enqueue('labels', {
                     group: 'workspace',
                     fetch: () => api.labels.list(),
                     apply: (dtos) => {
                        const changed = new Set(changedLabels);
                        changedLabels.clear();
                        applyLabels(dtos, changed);
                     },
                     onError: () => scheduleHydrate('workspace'),
                  });
               }
               return;
            case 'document':
               // Documentos não vivem no bootstrap: só a tela aberta recarrega.
               dispatch(DOCUMENT_CHANGED_EVENT, { id, teamId: parsed.teamId });
               return;
            case 'catalog':
               // #53: só status (sem `kind`) vive no bootstrap (STATUS = colunas do board).
               // Template/SLA/emoji avisam só quem os exibe.
               if (parsed.kind === 'emoji') invalidateCustomEmojis();
               else if (parsed.kind === 'sla')
                  dispatch(AUTOMATION_CHANGED_EVENT, { id, teamId: parsed.teamId });
               else if (parsed.kind)
                  dispatch(CATALOG_CHANGED_EVENT, { id, teamId: parsed.teamId, kind: parsed.kind });
               else {
                  scheduleHydrate('workspace');
                  dispatch(AUTOMATION_CHANGED_EVENT, { id, teamId: parsed.teamId });
               }
               return;
            case 'notification': {
               const me = useWorkspaceStore.getState().me?.id;
               if (parsed.recipientId && me && parsed.recipientId !== me) return;
               // Evento com o estado novo (`read`/`snoozedUntil`) vira patch local (#19).
               const notificationEvent = parsed as NotificationEvent;
               if (isNotificationPatch(notificationEvent)) {
                  useNotificationsStore.getState().applyNotificationPatch(notificationEvent);
                  return;
               }
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
               dispatch(REVIEW_CHANGED_EVENT, own ? { id, own } : { id });
               return;
            case 'automation':
               dispatch(AUTOMATION_CHANGED_EVENT, { id, teamId: parsed.teamId });
               return;
            default: {
               // Exaustivo: entidade nova no servidor quebra a compilação até ser tratada
               // aqui. Em runtime (servidor mais novo que o cliente), é ignorada.
               const unhandled: never = entity;
               void unhandled;
            }
         }
      };

      const connect = () => {
         // Sessão encerrada (#12): o cliente já foi para o login; não reconecta.
         if (closed || source || isSessionEnded()) return;
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
               // EventSource não expõe o status: um 401 do stream fecha a conexão igual a
               // uma queda. Sonda a sessão (`/me`) antes — 401 encerra (#12) e o
               // `connect` desiste; qualquer outro resultado reconecta.
               setTimeout(
                  () => void api.me().then(connect, connect),
                  espera * (0.5 + Math.random() / 2)
               );
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
         if (flushTimer) clearTimeout(flushTimer);
         if (windowTimer) clearTimeout(windowTimer);
         pending.clear();
         for (const t of timers.values()) clearTimeout(t);
         timers.clear();
         source?.close();
         source = null;
      };
   }, []);
}
