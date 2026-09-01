'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNotificationsStore } from '@/store/notifications-store';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   DropdownMenuLabel,
   DropdownMenuCheckboxItem,
   DropdownMenuSub,
   DropdownMenuSubTrigger,
   DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal, CheckCheck, ListFilter, MoreHorizontal, Bell } from 'lucide-react';
import { getNotificationIcon } from '@/lib/notification-utils';
import type { NotificationType } from '@/data/inbox';
import NotificationPreview from './issue-preview';
import IssueLine from './issue-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronLeft } from 'lucide-react';

/** Rótulos legíveis dos tipos de notificação para o filtro (ordem do Linear). */
const TYPE_LABELS: { value: NotificationType; label: string }[] = [
   { value: 'assignment', label: 'Assigned' },
   { value: 'mention', label: 'Mentioned' },
   { value: 'comment', label: 'Comment' },
   { value: 'status', label: 'Status changed' },
   { value: 'reopened', label: 'Reopened' },
   { value: 'closed', label: 'Closed' },
   { value: 'created', label: 'Created' },
   { value: 'edited', label: 'Edited' },
   { value: 'upload', label: 'Upload' },
];

export default function Inbox() {
   const {
      notifications,
      selectedNotification,
      setSelectedNotification,
      markAsRead,
      markAsUnread,
      markAllAsRead,
      snooze,
      unsnooze,
      snoozed,
      hydrateSnoozed,
      getUnreadNotifications,
   } = useNotificationsStore();

   const isMobile = useIsMobile();
   // Snoozed deixou de ser aba: vira o toggle "Show snoozed" do Display options
   // (paridade Linear) — as adiadas entram na própria lista, com o botão Restaurar.
   const [showSnoozed, setShowSnoozed] = useState(false);
   const [showRead, setShowRead] = useState(true);
   const [showUnreadFirst, setShowUnreadFirst] = useState(false);
   const [ordering, setOrdering] = useState('newest');
   const [showId, setShowId] = useState(true);
   const [showStatusIcon, setShowStatusIcon] = useState(true);
   // Filtro por tipo (padrão Linear): vazio = todos os tipos.
   const [typeFilter, setTypeFilter] = useState<Set<NotificationType>>(new Set());

   const toggleType = (type: NotificationType) =>
      setTypeFilter((prev) => {
         const next = new Set(prev);
         if (next.has(type)) next.delete(type);
         else next.add(type);
         return next;
      });

   // Ao ligar "Show snoozed", carrega as adiadas.
   useEffect(() => {
      if (showSnoozed) void hydrateSnoozed();
   }, [showSnoozed, hydrateSnoozed]);

   // Filter and sort notifications based on settings (memoizado: era recomputado — array
   // novo + re-sort — a cada render, re-renderizando toda a lista de notificações).
   // Com "Show snoozed" ligado, as adiadas entram na mesma lista (flag isSnoozed) e
   // participam da mesma ordenação — padrão Linear, sem aba separada.
   const filteredNotifications = useMemo(() => {
      const matches = (notification: (typeof notifications)[number]) => {
         if (!showRead && notification.read) return false;
         if (typeFilter.size > 0 && !typeFilter.has(notification.type)) return false;
         return true;
      };
      const merged = [
         ...notifications.filter(matches).map((item) => ({ item, isSnoozed: false })),
         ...(showSnoozed ? snoozed.filter(matches).map((item) => ({ item, isSnoozed: true })) : []),
      ];
      return merged.sort((a, b) => {
         if (showUnreadFirst) {
            if (!a.item.read && b.item.read) return -1;
            if (a.item.read && !b.item.read) return 1;
         }
         // Ordena pelo ISO cru (sortAt); timestamp é string relativa só p/ exibir.
         return ordering === 'newest'
            ? new Date(b.item.sortAt).getTime() - new Date(a.item.sortAt).getTime()
            : new Date(a.item.sortAt).getTime() - new Date(b.item.sortAt).getTime();
      });
   }, [notifications, snoozed, showSnoozed, showRead, showUnreadFirst, ordering, typeFilter]);

   const listPane = (
      <>
         {/* Header — espelho do Linear: "Inbox" 13px/500 + menu "..." de ações à esquerda;
             Add filter (funil) e Display options (sliders) à direita. */}
         <div className="flex h-11 items-center justify-between border-b border-border pl-[18px] pr-2.5">
            <div className="flex items-center gap-1.5">
               <SidebarTrigger className="inline-flex lg:hidden" />
               <span className="text-[13px] font-medium leading-4">Inbox</span>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="xs" aria-label="Notification actions">
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                     <DropdownMenuItem
                        onClick={markAllAsRead}
                        disabled={getUnreadNotifications().length === 0}
                     >
                        <CheckCheck className="size-4 text-muted-foreground" />
                        Mark all as read
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>

            <div className="flex items-center gap-0.5">
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="xs" className="relative" aria-label="Add filter">
                        <ListFilter className="size-4 text-muted-foreground" />
                        {typeFilter.size > 0 && (
                           <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                              {typeFilter.size}
                           </span>
                        )}
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                     <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Add filter…
                     </DropdownMenuLabel>
                     <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                           <Bell className="mr-2 size-4 text-muted-foreground" />
                           Notification type
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                           {TYPE_LABELS.map((type) => (
                              <DropdownMenuCheckboxItem
                                 key={type.value}
                                 checked={typeFilter.has(type.value)}
                                 onCheckedChange={() => toggleType(type.value)}
                                 onSelect={(event) => event.preventDefault()}
                              >
                                 <span className="mr-0.5 inline-flex">
                                    {getNotificationIcon(
                                       type.value,
                                       'size-3.5 text-muted-foreground'
                                    )}
                                 </span>
                                 {type.label}
                              </DropdownMenuCheckboxItem>
                           ))}
                        </DropdownMenuSubContent>
                     </DropdownMenuSub>
                     {typeFilter.size > 0 && (
                        <>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem onClick={() => setTypeFilter(new Set())}>
                              Clear filters
                           </DropdownMenuItem>
                        </>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="xs" aria-label="Display options">
                        <SlidersHorizontal className="size-4 text-muted-foreground" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                     {/* Ordering + toggles — mesma composição do popover do Linear. */}
                     <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-sm text-muted-foreground">Ordering</span>
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="xs" className="h-6 px-2 text-xs">
                                 {ordering === 'newest' ? 'Newest' : 'Oldest'}
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuCheckboxItem
                                 checked={ordering === 'newest'}
                                 onCheckedChange={() => setOrdering('newest')}
                              >
                                 Newest
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                 checked={ordering === 'oldest'}
                                 onCheckedChange={() => setOrdering('oldest')}
                              >
                                 Oldest
                              </DropdownMenuCheckboxItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>

                     <DropdownMenuSeparator />

                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-snoozed" className="text-sm font-normal">
                              Show snoozed
                           </Label>
                           <Switch
                              id="show-snoozed"
                              checked={showSnoozed}
                              onCheckedChange={setShowSnoozed}
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-read" className="text-sm font-normal">
                              Show read
                           </Label>
                           <Switch
                              id="show-read"
                              checked={showRead}
                              onCheckedChange={setShowRead}
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-unread-first" className="text-sm font-normal">
                              Show unread first
                           </Label>
                           <Switch
                              id="show-unread-first"
                              checked={showUnreadFirst}
                              onCheckedChange={setShowUnreadFirst}
                           />
                        </div>
                     </div>

                     <DropdownMenuSeparator />

                     <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Display properties
                     </DropdownMenuLabel>
                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-id" className="text-sm font-normal">
                              ID
                           </Label>
                           <Switch id="show-id" checked={showId} onCheckedChange={setShowId} />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-status-icon" className="text-sm font-normal">
                              Status and icon
                           </Label>
                           <Switch
                              id="show-status-icon"
                              checked={showStatusIcon}
                              onCheckedChange={setShowStatusIcon}
                           />
                        </div>
                     </div>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>
         <div className="flex h-[calc(100%-44px)] w-full flex-col items-center justify-start overflow-y-auto py-2">
            {filteredNotifications.length === 0 && isMobile && (
               <div className="h-full w-full">
                  <NotificationPreview />
               </div>
            )}
            {filteredNotifications.length > 0 &&
               filteredNotifications.map(({ item: notification, isSnoozed }) =>
                  isSnoozed ? (
                     <IssueLine
                        key={notification.id}
                        notification={notification}
                        onUnsnooze={() => unsnooze(notification.id)}
                        showId={showId}
                        showStatusIcon={showStatusIcon}
                     />
                  ) : (
                     <IssueLine
                        key={notification.id}
                        notification={notification}
                        isSelected={selectedNotification?.id === notification.id}
                        onClick={() => {
                           setSelectedNotification(notification);
                           // Padrão Linear: abrir a notificação já a marca como lida.
                           if (!notification.read) markAsRead(notification.id);
                        }}
                        onSnooze={(hours) => snooze(notification.id, hours)}
                        showId={showId}
                        showStatusIcon={showStatusIcon}
                     />
                  )
               )}
         </div>
      </>
   );

   if (isMobile) {
      return selectedNotification ? (
         <div className="flex flex-col h-full w-full">
            <button
               onClick={() => setSelectedNotification(undefined)}
               className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-4 text-sm text-muted-foreground hover:text-foreground"
            >
               <ChevronLeft className="size-4" />
               Inbox
            </button>
            <div className="flex-1 min-h-0">
               <NotificationPreview
                  notification={selectedNotification}
                  onMarkAsRead={markAsRead}
                  onMarkAsUnread={markAsUnread}
               />
            </div>
         </div>
      ) : (
         <div className="flex flex-col h-full w-full">{listPane}</div>
      );
   }

   return (
      <div className="grid h-full w-full grid-cols-[300px_minmax(0,1fr)]">
         <section className="min-w-0 border-r border-border">{listPane}</section>
         <section className="min-w-0">
            <NotificationPreview
               notification={selectedNotification}
               onMarkAsRead={markAsRead}
               onMarkAsUnread={markAsUnread}
            />
         </section>
      </div>
   );
}
