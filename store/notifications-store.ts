import type { NotificationType } from '@/data/inbox';
import type { Issue } from '@/data/issues';
import type { User } from '@/data/users';
import type { NotificationDto, NotificationEventPatch } from '@/lib/api/notifications';
import { adaptUser } from '@/lib/adapters';
import { api } from '@/lib/client';
import { relativeTime } from '@/lib/relative-time';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';
import { create } from 'zustand';

/**
 * Notificação do inbox, montada do DTO (não depende da issue estar no issues-store —
 * antes a notificação de issue fora do store era descartada e o inbox ficava "vazio"
 * com badge N, #19). `sortAt` é o ISO original (ordena e alimenta o tempo relativo,
 * calculado na renderização); `timestamp` é o relativo no momento da carga.
 */
export interface InboxNotification {
   id: string;
   type: NotificationType;
   content: string;
   user: User;
   read: boolean;
   sortAt: string;
   timestamp: string;
   snoozedUntil: string | null;
   issueId: string | null;
   identifier: string;
   title: string;
   /** Status da issue quando ela está no store (snapshot); a linha lê o vivo. */
   status: Issue['status'] | null;
}

/** Evento `notification` como chega do SSE (os campos do patch são aditivos). */
export interface NotificationEvent extends NotificationEventPatch {
   id?: string;
   recipientId?: string;
}

/** O evento traz estado novo aplicável como patch (senão: hidratar). */
export function isNotificationPatch(event: NotificationEvent): boolean {
   return event.read !== undefined || event.snoozedUntil !== undefined;
}

interface NotificationsState {
   // Data
   notifications: InboxNotification[];
   /** Notificações atualmente adiadas (aba Snoozed) — carregadas sob demanda. */
   snoozed: InboxNotification[];
   selectedNotification: InboxNotification | undefined;
   // Contagem autoritativa de não-lidas (servidor) — a lista hidratada é capada
   // (DEFAULT_INBOX_LIMIT), então contar localmente subconta. Mantida em sincronia
   // por deltas otimistas nas ações e pelos patches dos eventos.
   unreadCount: number;
   /** Primeira hidratação terminou (sucesso ou falha) — antes disso a UI mostra skeleton, não vazio. */
   loaded: boolean;
   /** A última hidratação falhou — com a lista vazia, o inbox mostra erro + retry (não "vazio"). */
   loadError: boolean;

   // Hydration
   hydrate: () => Promise<void>;
   /** Carrega a lista de adiadas vigentes (aba Snoozed). */
   hydrateSnoozed: () => Promise<void>;
   /**
    * Aplica o estado que veio no evento SSE (`read`/`snoozedUntil`/`all`) sem re-hidratar
    * — idempotente com o otimista da própria ação (#19). Evento sem patch → hidrata.
    */
   applyNotificationPatch: (event: NotificationEvent) => void;

   // Actions
   setSelectedNotification: (notification: InboxNotification | undefined) => void;
   markAsRead: (id: string) => void;
   markAllAsRead: () => void;
   markAsUnread: (id: string) => void;
   /** Adia a notificação por `hours` horas (some do inbox até vencer). */
   snooze: (id: string, hours: number) => void;
   /** Desfaz o adiamento: volta pro inbox e some da aba Snoozed. */
   unsnooze: (id: string) => void;

   // Filters
   getUnreadNotifications: () => InboxNotification[];

   // Utility functions
   getNotificationById: (id: string) => InboxNotification | undefined;
   getUnreadCount: () => number;
}

/** Ator desconhecido (usuário removido, notificação de sistema). */
const UNKNOWN_ACTOR: User = {
   id: 'unknown',
   name: 'Circle',
   email: '',
   avatarUrl: '',
   status: 'offline',
   role: 'Application',
   joinedDate: '2026-01-01',
   teamIds: [],
   timezone: 'UTC',
};

/**
 * NotificationDto (API) → InboxNotification. A issue viva do store, se houver, só
 * contribui com status/assignee; o que a linha mostra vem do `dto.issue`.
 */
function adaptNotification(
   dto: NotificationDto,
   issueById: Map<string, Issue>
): InboxNotification | null {
   if (!dto.issue) return null;
   const issue = issueById.get(dto.issue.id);
   const user = dto.actor ? adaptUser(dto.actor) : (issue?.assignee ?? UNKNOWN_ACTOR);
   return {
      id: dto.id,
      type: dto.type as NotificationType,
      content: dto.content ?? '',
      user,
      read: dto.read,
      sortAt: dto.createdAt,
      timestamp: relativeTime(dto.createdAt),
      snoozedUntil: dto.snoozedUntil,
      issueId: dto.issue.id,
      identifier: dto.issue.identifier,
      title: dto.issue.title,
      status: issue?.status ?? null,
   };
}

function adaptAll(dtos: NotificationDto[]): InboxNotification[] {
   const issueById = new Map(useIssuesStore.getState().issues.map((i) => [i.id, i]));
   return dtos
      .map((dto) => adaptNotification(dto, issueById))
      .filter((item): item is InboxNotification => item !== null);
}

/** Adiamento ainda vigente. */
function isSnoozedNow(n: Pick<InboxNotification, 'snoozedUntil'>): boolean {
   return n.snoozedUntil !== null && new Date(n.snoozedUntil).getTime() > Date.now();
}

let hydrateSeq = 0;
let countSeq = 0;

/** Marca `read` nas notificações `ids` (lista + seleção) — base dos rollbacks direcionados. */
function setReadIn(
   state: Pick<NotificationsState, 'notifications' | 'selectedNotification'>,
   ids: Set<string>,
   read: boolean
) {
   return {
      notifications: state.notifications.map((n) => (ids.has(n.id) ? { ...n, read } : n)),
      selectedNotification:
         state.selectedNotification && ids.has(state.selectedNotification.id)
            ? { ...state.selectedNotification, read }
            : state.selectedNotification,
   };
}

const byNewest = (a: InboxNotification, b: InboxNotification) => b.sortAt.localeCompare(a.sortAt);

/** Timer para trazer de volta a adiada quando o adiamento vence (sem reload). */
let snoozeTimer: ReturnType<typeof setTimeout> | null = null;

export const useNotificationsStore = create<NotificationsState>((set, get) => {
   /** Reconsulta só a contagem (patch de notificação fora da lista capada). */
   const refreshUnreadCount = async () => {
      const seq = ++countSeq;
      try {
         const { count } = await api.inbox.unreadCount();
         if (seq === countSeq) set({ unreadCount: count });
      } catch {
         // mantém a contagem atual
      }
   };

   /** Agenda uma hidratação para quando o primeiro adiamento conhecido vencer. */
   const scheduleSnoozeWake = (untilIso: string) => {
      const ms = new Date(untilIso).getTime() - Date.now();
      // setTimeout estoura acima de ~24,8 dias; adiamentos longos voltam no próximo hydrate.
      if (!(ms > 0) || ms > 2 ** 31 - 1) return;
      if (snoozeTimer) clearTimeout(snoozeTimer);
      snoozeTimer = setTimeout(() => {
         snoozeTimer = null;
         void get().hydrate();
      }, ms + 1000);
   };

   return {
      // Initial state — vazio; populado via hydrate() a partir da API.
      notifications: [],
      snoozed: [],
      selectedNotification: undefined,
      unreadCount: 0,
      loaded: false,
      loadError: false,

      hydrate: async () => {
         // Token de sequência: uma hidratação que termina DEPOIS de outra mais nova é descartada.
         const seq = ++hydrateSeq;
         try {
            const [dtos, countRes] = await Promise.all([
               api.inbox.list(),
               api.inbox.unreadCount().catch(() => ({ count: 0 })),
            ]);
            if (seq !== hydrateSeq) return;
            const items = adaptAll(dtos);
            set((state) => ({
               notifications: items,
               unreadCount: countRes.count,
               loaded: true,
               loadError: false,
               // Reconcilia a seleção com a versão fresca (read/content podem ter mudado
               // no servidor); se sumiu da lista, mantém o snapshot atual para o preview
               // aberto não desaparecer no meio da leitura.
               selectedNotification: state.selectedNotification
                  ? (items.find((item) => item.id === state.selectedNotification!.id) ??
                    state.selectedNotification)
                  : undefined,
            }));
         } catch {
            if (seq !== hydrateSeq) return;
            // Mantém a lista atual e sinaliza a falha (a tela vazia vira erro + retry).
            set({ loaded: true, loadError: true });
         }
      },

      hydrateSnoozed: async () => {
         try {
            const dtos = await api.inbox.list('?snoozed=true');
            const items = adaptAll(dtos);
            set({ snoozed: items });
            const earliest = items
               .map((n) => n.snoozedUntil)
               .filter(Boolean)
               .sort()[0];
            if (earliest) scheduleSnoozeWake(earliest);
         } catch {
            // Degradação graciosa.
         }
      },

      applyNotificationPatch: (event) => {
         if (!isNotificationPatch(event)) {
            void get().hydrate();
            return;
         }
         const state = get();
         if (event.all) {
            if (event.read === undefined) return;
            const read = event.read;
            const mark = (n: InboxNotification) => (n.read === read ? n : { ...n, read });
            set({
               notifications: state.notifications.map(mark),
               snoozed: state.snoozed.map(mark),
               selectedNotification: state.selectedNotification
                  ? mark(state.selectedNotification)
                  : undefined,
            });
            if (read) set({ unreadCount: 0 });
            else void refreshUnreadCount();
            return;
         }
         const id = event.id;
         if (!id) return;
         const inList = state.notifications.find((n) => n.id === id);
         const inSnoozed = state.snoozed.find((n) => n.id === id);
         const current = inList ?? inSnoozed;
         if (!current) {
            // Fora da lista capada (ou adiada sem a aba aberta): muda só a contagem;
            // desfazer um adiamento traz um item que não temos → hidrata.
            if (event.snoozedUntil === null) void get().hydrate();
            else void refreshUnreadCount();
            return;
         }
         const next: InboxNotification = {
            ...current,
            read: event.read ?? current.read,
            snoozedUntil:
               event.snoozedUntil !== undefined ? event.snoozedUntil : current.snoozedUntil,
         };
         const snoozedNow = isSnoozedNow(next);
         // A contagem do servidor ignora as adiadas vigentes.
         const wasCounted = !current.read && !isSnoozedNow(current);
         const isCounted = !next.read && !snoozedNow;
         const delta = (isCounted ? 1 : 0) - (wasCounted ? 1 : 0);
         const without = (list: InboxNotification[]) => list.filter((n) => n.id !== id);
         const upsert = (list: InboxNotification[], has: boolean) =>
            has ? list.map((n) => (n.id === id ? next : n)) : [...list, next].sort(byNewest);
         set({
            notifications: snoozedNow
               ? without(state.notifications)
               : upsert(state.notifications, !!inList),
            snoozed: snoozedNow ? upsert(state.snoozed, !!inSnoozed) : without(state.snoozed),
            selectedNotification:
               state.selectedNotification?.id === id
                  ? snoozedNow
                     ? undefined
                     : next
                  : state.selectedNotification,
            unreadCount: Math.max(0, state.unreadCount + delta),
         });
         if (snoozedNow && next.snoozedUntil) scheduleSnoozeWake(next.snoozedUntil);
      },

      // Actions
      setSelectedNotification: (notification: InboxNotification | undefined) => {
         set({ selectedNotification: notification });
      },

      markAsRead: (id: string) => {
         const wasUnread = get().notifications.some((n) => n.id === id && !n.read);
         set((state) => ({
            ...setReadIn(state, new Set([id]), true),
            unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
         }));
         void api.inbox.setRead(id, true).catch(() => {
            // Rollback direcionado: só esta notificação (não o store inteiro).
            set((state) => ({
               ...setReadIn(state, new Set([id]), false),
               unreadCount: wasUnread ? state.unreadCount + 1 : state.unreadCount,
            }));
            toast.error('Falha ao marcar como lida');
         });
      },

      markAllAsRead: () => {
         const unreadIds = new Set(
            get()
               .notifications.filter((n) => !n.read)
               .map((n) => n.id)
         );
         const prevCount = get().unreadCount;
         set((state) => ({
            notifications: state.notifications.map((notification) =>
               notification.read ? notification : { ...notification, read: true }
            ),
            selectedNotification: state.selectedNotification
               ? { ...state.selectedNotification, read: true }
               : undefined,
            unreadCount: 0,
         }));
         void api.inbox.readAll().catch(() => {
            // Rollback direcionado: só as que ESTA ação marcou como lidas.
            set((state) => ({
               ...setReadIn(state, unreadIds, false),
               unreadCount: state.unreadCount + prevCount,
            }));
            toast.error('Falha ao marcar todas como lidas');
         });
      },

      markAsUnread: (id: string) => {
         const wasRead = get().notifications.some((n) => n.id === id && n.read);
         set((state) => ({
            ...setReadIn(state, new Set([id]), false),
            unreadCount: wasRead ? state.unreadCount + 1 : state.unreadCount,
         }));
         void api.inbox.setRead(id, false).catch(() => {
            set((state) => ({
               ...setReadIn(state, new Set([id]), true),
               unreadCount: wasRead ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
            }));
            toast.error('Falha ao marcar como não lida');
         });
      },

      snooze: (id: string, hours: number) => {
         const removed = get().notifications.find((n) => n.id === id);
         const wasSelected = get().selectedNotification?.id === id;
         const wasUnread = get().notifications.some((n) => n.id === id && !n.read);
         const until = new Date(Date.now() + hours * 3600_000).toISOString();
         // Otimista: a adiada some do inbox default (o backend a filtra até vencer) e
         // entra na lista de adiadas (o "Show snoozed" a mostra na hora).
         set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
            snoozed:
               removed && !state.snoozed.some((n) => n.id === id)
                  ? [...state.snoozed, { ...removed, snoozedUntil: until }].sort(byNewest)
                  : state.snoozed,
            selectedNotification:
               state.selectedNotification?.id === id ? undefined : state.selectedNotification,
            unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
         }));
         scheduleSnoozeWake(until);
         void api.inbox
            .snooze(id, until)
            .then(() => toast.success(`Adiada por ${hours}h`))
            .catch(() => {
               // Rollback direcionado: devolve só a notificação adiada (na ordem por data).
               set((state) => {
                  if (!removed || state.notifications.some((n) => n.id === id)) return {};
                  return {
                     notifications: [...state.notifications, removed].sort(byNewest),
                     snoozed: state.snoozed.filter((n) => n.id !== id),
                     selectedNotification:
                        wasSelected && !state.selectedNotification
                           ? removed
                           : state.selectedNotification,
                     unreadCount: wasUnread ? state.unreadCount + 1 : state.unreadCount,
                  };
               });
               toast.error('Falha ao adiar');
            });
      },

      unsnooze: (id: string) => {
         const removed = get().snoozed.find((n) => n.id === id);
         const restored = removed ? { ...removed, snoozedUntil: null } : undefined;
         // Otimista: sai das adiadas e volta ao inbox na posição por data — sem re-hidratar.
         set((state) => ({
            snoozed: state.snoozed.filter((n) => n.id !== id),
            notifications:
               restored && !state.notifications.some((n) => n.id === id)
                  ? [...state.notifications, restored].sort(byNewest)
                  : state.notifications,
            unreadCount: restored && !restored.read ? state.unreadCount + 1 : state.unreadCount,
         }));
         void api.inbox
            .snooze(id, null)
            .then(() => toast.success('Adiamento desfeito'))
            .catch(() => {
               // Rollback direcionado: devolve só esta à lista de adiadas.
               set((state) =>
                  removed && !state.snoozed.some((n) => n.id === id)
                     ? {
                          snoozed: [...state.snoozed, removed],
                          notifications: state.notifications.filter((n) => n.id !== id),
                          unreadCount:
                             restored && !restored.read
                                ? Math.max(0, state.unreadCount - 1)
                                : state.unreadCount,
                       }
                     : {}
               );
               toast.error('Falha ao desfazer o adiamento');
            });
      },

      // Filters
      getUnreadNotifications: () => {
         return get().notifications.filter((notification) => !notification.read);
      },

      // Utility functions
      getNotificationById: (id: string) => {
         return get().notifications.find((notification) => notification.id === id);
      },

      getUnreadCount: () => {
         // Contagem autoritativa do servidor (não a da lista hidratada, que é capada).
         return get().unreadCount;
      },
   };
});
