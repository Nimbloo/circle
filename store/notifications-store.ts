import { InboxItem, NotificationType } from '@/data/inbox';
import type { Issue } from '@/data/issues';
import type { NotificationDto } from '@/lib/api/notifications';
import { adaptUser } from '@/lib/adapters';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';
import { create } from 'zustand';

/**
 * InboxItem + a chave de ordenação crua. `timestamp` é uma string relativa
 * ("2h", "1d") só para exibição; `sortAt` guarda o ISO original p/ ordenar
 * de forma estável (new Date(timestamp) daria Invalid Date).
 */
export interface InboxNotification extends InboxItem {
   sortAt: string;
}

interface NotificationsState {
   // Data
   notifications: InboxNotification[];
   /** Notificações atualmente adiadas (aba Snoozed) — carregadas sob demanda. */
   snoozed: InboxNotification[];
   selectedNotification: InboxNotification | undefined;
   // Contagem autoritativa de não-lidas (servidor) — a lista hidratada é capada
   // (DEFAULT_INBOX_LIMIT) e descarta itens sem issue conhecida, então contar
   // localmente subconta. Mantida em sincronia por deltas otimistas nas ações.
   unreadCount: number;
   /** Primeira hidratação terminou (sucesso ou falha) — antes disso a UI mostra skeleton, não vazio. */
   loaded: boolean;
   /** A última hidratação falhou — com a lista vazia, o inbox mostra erro + retry (não "vazio"). */
   loadError: boolean;

   // Hydration
   hydrate: () => Promise<void>;
   /** Carrega a lista de adiadas vigentes (aba Snoozed). */
   hydrateSnoozed: () => Promise<void>;

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

/** Tempo relativo compacto ("2h", "1d") a partir de um ISO — igual ao formato do inbox. */
function relativeTime(iso: string): string {
   const then = new Date(iso).getTime();
   const diff = Math.max(0, Date.now() - then);
   const min = Math.floor(diff / 60000);
   if (min < 1) return 'now';
   if (min < 60) return `${min}m`;
   const hours = Math.floor(min / 60);
   if (hours < 24) return `${hours}h`;
   const days = Math.floor(hours / 24);
   if (days < 7) return `${days}d`;
   return `${Math.floor(days / 7)}w`;
}

/**
 * NotificationDto (API) -> InboxItem (que estende Issue). A notificação referencia
 * uma issue real que já vive no issues-store; mesclamos com ela para o preview.
 * Itens sem issue conhecida são descartados (sem preview a mostrar).
 */
function adaptNotification(
   dto: NotificationDto,
   issueById: Map<string, Issue>
): InboxNotification | null {
   const issue = dto.issue ? issueById.get(dto.issue.id) : undefined;
   if (!issue) return null;
   const user = dto.actor ? adaptUser(dto.actor) : issue.assignee;
   if (!user) return null;
   return {
      ...issue,
      id: dto.id,
      content: dto.content ?? '',
      type: dto.type as NotificationType,
      user,
      timestamp: relativeTime(dto.createdAt),
      sortAt: dto.createdAt,
      read: dto.read,
   };
}

let hydrateSeq = 0;

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

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
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
         const issueById = new Map(useIssuesStore.getState().issues.map((i) => [i.id, i]));
         const items = dtos
            .map((dto) => adaptNotification(dto, issueById))
            .filter((item): item is InboxNotification => item !== null);
         set((state) => ({
            notifications: items,
            unreadCount: countRes.count,
            loaded: true,
            loadError: false,
            // Reconcilia a seleção com a versão fresca (read/content/timestamp podem
            // ter mudado no servidor); se sumiu da lista, mantém o snapshot atual
            // para o preview aberto não desaparecer no meio da leitura.
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
         const issueById = new Map(useIssuesStore.getState().issues.map((i) => [i.id, i]));
         const items = dtos
            .map((dto) => adaptNotification(dto, issueById))
            .filter((item): item is InboxNotification => item !== null);
         set({ snoozed: items });
      } catch {
         // Degradação graciosa.
      }
   },

   // Actions
   setSelectedNotification: (notification: InboxNotification | undefined) => {
      set({ selectedNotification: notification });
   },

   markAsRead: (id: string) => {
      const wasUnread = get().notifications.some((n) => n.id === id && !n.read);
      set((state) => ({
         notifications: state.notifications.map((notification) =>
            notification.id === id ? { ...notification, read: true } : notification
         ),
         selectedNotification:
            state.selectedNotification?.id === id
               ? { ...state.selectedNotification, read: true }
               : state.selectedNotification,
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
         notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
         })),
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
         notifications: state.notifications.map((notification) =>
            notification.id === id ? { ...notification, read: false } : notification
         ),
         selectedNotification:
            state.selectedNotification?.id === id
               ? { ...state.selectedNotification, read: false }
               : state.selectedNotification,
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
      // Otimista: a adiada some do inbox default (o backend a filtra até vencer).
      set((state) => ({
         notifications: state.notifications.filter((n) => n.id !== id),
         selectedNotification:
            state.selectedNotification?.id === id ? undefined : state.selectedNotification,
         unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      }));
      const until = new Date(Date.now() + hours * 3600_000).toISOString();
      void api.inbox
         .snooze(id, until)
         .then(() => toast.success(`Adiada por ${hours}h`))
         .catch(() => {
            // Rollback direcionado: devolve só a notificação adiada (na ordem por data).
            set((state) => {
               if (!removed || state.notifications.some((n) => n.id === id)) return {};
               return {
                  notifications: [...state.notifications, removed].sort((a, b) =>
                     b.sortAt.localeCompare(a.sortAt)
                  ),
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
      // Otimista: some da aba Snoozed; ao recarregar o inbox ela reaparece.
      set((state) => ({ snoozed: state.snoozed.filter((n) => n.id !== id) }));
      void api.inbox
         .snooze(id, null)
         .then(() => {
            toast.success('Adiamento desfeito');
            void get().hydrate();
         })
         .catch(() => {
            // Rollback direcionado: devolve só esta à lista de adiadas.
            set((state) =>
               removed && !state.snoozed.some((n) => n.id === id)
                  ? { snoozed: [...state.snoozed, removed] }
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
}));
