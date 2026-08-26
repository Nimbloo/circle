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

/** Filtros do inbox aplicados NO BACKEND (query params do `listInbox`). */
export interface InboxFilters {
   types: NotificationType[];
   actorIds: string[];
   read?: boolean;
}

interface NotificationsState {
   // Data
   notifications: InboxNotification[];
   selectedNotification: InboxNotification | undefined;
   inboxFilters: InboxFilters;
   /** DTOs crus do último fetch (para re-mapear quando o board de issues chega). */
   rawDtos: NotificationDto[];

   // Hydration
   hydrate: () => Promise<void>;
   /** Re-mapeia a lista a partir dos DTOs já baixados usando o board ATUAL de issues.
    * Corrige a corrida em que as notificações hidratam antes do board (issues ausentes
    * eram descartadas e nunca reapareciam). */
   remap: () => void;
   /** Atualiza os filtros e re-hidrata a lista a partir do backend. */
   setInboxFilters: (patch: Partial<InboxFilters>) => void;

   // Actions
   setSelectedNotification: (notification: InboxNotification | undefined) => void;
   markAsRead: (id: string) => void;
   markAllAsRead: () => void;
   markAsUnread: (id: string) => void;
   deleteNotification: (id: string) => void;
   snoozeNotification: (id: string, until: Date | null) => void;

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
   inboxFilters: { types: [], actorIds: [] },
   rawDtos: [],

   hydrate: async () => {
      try {
         const f = get().inboxFilters;
         const sp = new URLSearchParams();
         f.types.forEach((t) => sp.append('type', t));
         f.actorIds.forEach((a) => sp.append('from', a));
         if (f.read !== undefined) sp.set('read', String(f.read));
         const qs = sp.toString();
         const dtos = await api.inbox.list(qs ? `?${qs}` : '');
         const issueById = new Map(useIssuesStore.getState().issues.map((i) => [i.id, i]));
         const items = dtos
            .map((dto) => adaptNotification(dto, issueById))
            .filter((item): item is InboxNotification => item !== null);
         set({ notifications: items, rawDtos: dtos });
      } catch {
         // Degradação graciosa — mantém o estado atual se a API falhar.
      }
   },

   remap: () => {
      const dtos = get().rawDtos;
      if (dtos.length === 0) return;
      const issueById = new Map(useIssuesStore.getState().issues.map((i) => [i.id, i]));
      const items = dtos
         .map((dto) => adaptNotification(dto, issueById))
         .filter((item): item is InboxNotification => item !== null);
      // Só aplica se mudou a contagem (board chegou e destravou itens) — evita re-render inútil.
      if (items.length !== get().notifications.length) set({ notifications: items });
   },

   setInboxFilters: (patch) => {
      set((state) => ({ inboxFilters: { ...state.inboxFilters, ...patch } }));
      void get().hydrate();
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

   deleteNotification: (id: string) => {
      const snapshot = {
         notifications: get().notifications,
         selectedNotification: get().selectedNotification,
      };
      set((state) => ({
         notifications: state.notifications.filter((n) => n.id !== id),
         selectedNotification:
            state.selectedNotification?.id === id ? undefined : state.selectedNotification,
      }));
      void api.inbox.remove(id).catch(() => {
         set(snapshot);
         toast.error('Falha ao excluir a notificação');
      });
   },

   snoozeNotification: (id: string, until: Date | null) => {
      const snapshot = {
         notifications: get().notifications,
         selectedNotification: get().selectedNotification,
      };
      // Adiar remove da lista visível (reaparece quando o prazo passa, via refetch/SSE);
      // desfazer (until=null) só reverte o servidor — o item já não está oculto localmente.
      if (until) {
         set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
            selectedNotification:
               state.selectedNotification?.id === id ? undefined : state.selectedNotification,
         }));
      }
      void api.inbox.snooze(id, until ? until.toISOString() : null).catch(() => {
         set(snapshot);
         toast.error('Falha ao adiar a notificação');
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

// Quando o board de issues muda (ex.: termina de hidratar DEPOIS das notificações),
// re-mapeia o inbox pra destravar notificações cujas issues ainda não existiam.
useIssuesStore.subscribe((state, prev) => {
   if (state.issues !== prev.issues) useNotificationsStore.getState().remap();
});
