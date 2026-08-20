import { InboxItem, NotificationType } from '@/mock-data/inbox';
import type { Issue } from '@/mock-data/issues';
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
   selectedNotification: InboxNotification | undefined;

   // Hydration
   hydrate: () => Promise<void>;

   // Actions
   setSelectedNotification: (notification: InboxNotification | undefined) => void;
   markAsRead: (id: string) => void;
   markAllAsRead: () => void;
   markAsUnread: (id: string) => void;

   // Filters
   getUnreadNotifications: () => InboxNotification[];
   getReadNotifications: () => InboxNotification[];
   getNotificationsByType: (type: NotificationType) => InboxNotification[];
   getNotificationsByUser: (userId: string) => InboxNotification[];

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

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
   // Initial state — vazio; populado via hydrate() a partir da API.
   notifications: [],
   selectedNotification: undefined,

   hydrate: async () => {
      try {
         const dtos = await api.inbox.list();
         const issueById = new Map(useIssuesStore.getState().issues.map((i) => [i.id, i]));
         const items = dtos
            .map((dto) => adaptNotification(dto, issueById))
            .filter((item): item is InboxNotification => item !== null);
         set({ notifications: items });
      } catch {
         // Degradação graciosa — mantém o estado atual se a API falhar.
      }
   },

   // Actions
   setSelectedNotification: (notification: InboxNotification | undefined) => {
      set({ selectedNotification: notification });
   },

   markAsRead: (id: string) => {
      const snapshot = {
         notifications: get().notifications,
         selectedNotification: get().selectedNotification,
      };
      set((state) => ({
         notifications: state.notifications.map((notification) =>
            notification.id === id ? { ...notification, read: true } : notification
         ),
         selectedNotification:
            state.selectedNotification?.id === id
               ? { ...state.selectedNotification, read: true }
               : state.selectedNotification,
      }));
      void api.inbox.setRead(id, true).catch(() => {
         set(snapshot);
         toast.error('Falha ao marcar como lida');
      });
   },

   markAllAsRead: () => {
      const snapshot = {
         notifications: get().notifications,
         selectedNotification: get().selectedNotification,
      };
      set((state) => ({
         notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
         })),
         selectedNotification: state.selectedNotification
            ? { ...state.selectedNotification, read: true }
            : undefined,
      }));
      void api.inbox.readAll().catch(() => {
         set(snapshot);
         toast.error('Falha ao marcar todas como lidas');
      });
   },

   markAsUnread: (id: string) => {
      const snapshot = {
         notifications: get().notifications,
         selectedNotification: get().selectedNotification,
      };
      set((state) => ({
         notifications: state.notifications.map((notification) =>
            notification.id === id ? { ...notification, read: false } : notification
         ),
         selectedNotification:
            state.selectedNotification?.id === id
               ? { ...state.selectedNotification, read: false }
               : state.selectedNotification,
      }));
      void api.inbox.setRead(id, false).catch(() => {
         set(snapshot);
         toast.error('Falha ao marcar como não lida');
      });
   },

   // Filters
   getUnreadNotifications: () => {
      return get().notifications.filter((notification) => !notification.read);
   },

   getReadNotifications: () => {
      return get().notifications.filter((notification) => notification.read);
   },

   getNotificationsByType: (type: NotificationType) => {
      return get().notifications.filter((notification) => notification.type === type);
   },

   getNotificationsByUser: (userId: string) => {
      return get().notifications.filter((notification) => notification.user.id === userId);
   },

   // Utility functions
   getNotificationById: (id: string) => {
      return get().notifications.find((notification) => notification.id === id);
   },

   getUnreadCount: () => {
      return get().notifications.filter((notification) => !notification.read).length;
   },
}));
