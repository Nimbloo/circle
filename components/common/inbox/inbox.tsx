'use client';

import { useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWorkspaceStore } from '@/store/workspace-store';
import { getNotificationIcon } from '@/lib/notification-utils';
import type { NotificationType } from '@/data/inbox';
import {
   SlidersHorizontal,
   CheckCheck,
   ArrowUpDown,
   InboxIcon,
   ListFilter,
   MoreHorizontal,
   User,
   X,
} from 'lucide-react';
import NotificationPreview from './issue-preview';
import IssueLine from './issue-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronLeft } from 'lucide-react';

/** Rótulos legíveis dos tipos de notificação (para o filtro), na ordem do Linear. */
const TYPE_LABELS: { value: NotificationType; label: string }[] = [
   { value: 'assignment', label: 'Assigned' },
   { value: 'mention', label: 'Mentioned' },
   { value: 'comment', label: 'Comment' },
   { value: 'status', label: 'Status changed' },
   { value: 'reopened', label: 'Reopened' },
   { value: 'closed', label: 'Closed' },
   { value: 'created', label: 'Created' },
   { value: 'edited', label: 'Edited' },
   { value: 'update', label: 'Updated' },
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
      getUnreadNotifications,
      inboxFilters,
      setInboxFilters,
   } = useNotificationsStore();
   const users = useWorkspaceStore((s) => s.users);

   const isMobile = useIsMobile();
   const [showUnreadFirst, setShowUnreadFirst] = useState(false);
   const [ordering, setOrdering] = useState('newest');
   const [showId, setShowId] = useState(true);
   const [showStatusIcon, setShowStatusIcon] = useState(true);

   // Filtros de conteúdo (type/from/read) são aplicados NO BACKEND (inboxFilters →
   // re-hydrate). Aqui só resta a ORDENAÇÃO/agrupamento (concern de display).
   const toggleType = (t: NotificationType) =>
      setInboxFilters({
         types: inboxFilters.types.includes(t)
            ? inboxFilters.types.filter((x) => x !== t)
            : [...inboxFilters.types, t],
      });
   const toggleActor = (id: string) =>
      setInboxFilters({
         actorIds: inboxFilters.actorIds.includes(id)
            ? inboxFilters.actorIds.filter((x) => x !== id)
            : [...inboxFilters.actorIds, id],
      });
   const activeFilterCount =
      inboxFilters.types.length +
      inboxFilters.actorIds.length +
      (inboxFilters.read !== undefined ? 1 : 0);
   const clearFilters = () => setInboxFilters({ types: [], actorIds: [], read: undefined });

   const filteredNotifications = [...notifications].sort((a, b) => {
         if (showUnreadFirst) {
            if (!a.read && b.read) return -1;
            if (a.read && !b.read) return 1;
         }
         // Ordena pelo ISO cru (sortAt); timestamp é string relativa só p/ exibir.
         return ordering === 'newest'
            ? new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
            : new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime();
      });

   const listPane = (
      <>
         <div className="flex items-center justify-between px-4 h-10 border-b border-border">
            <div className="flex items-center gap-1">
               <SidebarTrigger className="inline-flex lg:hidden" />
               <h2 className="text-[13px] font-medium">Inbox</h2>
               {/* ⋯ Notification actions — colado no título (estilo Linear) */}
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground"
                        aria-label="Notification actions"
                     >
                        <MoreHorizontal className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuItem
                        onClick={markAllAsRead}
                        disabled={getUnreadNotifications().length === 0}
                     >
                        <CheckCheck className="size-4" /> Mark all as read
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>

            <div className="flex items-center gap-1">
               {/* Add filter — Notification type / From / read, aplicados no BACKEND */}
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground"
                        aria-label="Add filter"
                     >
                        <ListFilter className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                     <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                           <ListFilter className="mr-2 size-4" /> Notification type
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                           {TYPE_LABELS.map((t) => (
                              <DropdownMenuCheckboxItem
                                 key={t.value}
                                 checked={inboxFilters.types.includes(t.value)}
                                 onCheckedChange={() => toggleType(t.value)}
                                 onSelect={(e) => e.preventDefault()}
                              >
                                 {getNotificationIcon(t.value, 'size-3.5')}
                                 <span className="ml-1.5">{t.label}</span>
                              </DropdownMenuCheckboxItem>
                           ))}
                        </DropdownMenuSubContent>
                     </DropdownMenuSub>

                     <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                           <User className="mr-2 size-4" /> From
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-56">
                           {users.map((u) => (
                              <DropdownMenuCheckboxItem
                                 key={u.id}
                                 checked={inboxFilters.actorIds.includes(u.id)}
                                 onCheckedChange={() => toggleActor(u.id)}
                                 onSelect={(e) => e.preventDefault()}
                              >
                                 <Avatar className="size-4">
                                    <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                                    <AvatarFallback className="text-[9px]">
                                       {u.name[0]}
                                    </AvatarFallback>
                                 </Avatar>
                                 <span className="ml-1.5 truncate">{u.name}</span>
                              </DropdownMenuCheckboxItem>
                           ))}
                        </DropdownMenuSubContent>
                     </DropdownMenuSub>

                     <DropdownMenuSeparator />

                     <DropdownMenuCheckboxItem
                        checked={inboxFilters.read === false}
                        onCheckedChange={(v) =>
                           setInboxFilters({ read: v ? false : undefined })
                        }
                        onSelect={(e) => e.preventDefault()}
                     >
                        Unread only
                     </DropdownMenuCheckboxItem>

                     {activeFilterCount > 0 && (
                        <>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem onClick={clearFilters}>
                              <X className="size-4" /> Clear filters
                           </DropdownMenuItem>
                        </>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>

               {/* Display options (ordering + propriedades) */}
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground"
                        aria-label="Display options"
                     >
                        <SlidersHorizontal className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                     <DropdownMenuLabel className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4" />
                        Ordering
                     </DropdownMenuLabel>
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

                     <DropdownMenuSeparator />

                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-unread-first" className="text-sm">
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

                     <DropdownMenuLabel>Display properties</DropdownMenuLabel>
                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-id" className="text-sm">
                              ID
                           </Label>
                           <Switch id="show-id" checked={showId} onCheckedChange={setShowId} />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-status-icon" className="text-sm">
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
         <div className="w-full flex flex-col items-center justify-start overflow-y-auto h-[calc(100%-40px)] pb-0.25">
            {filteredNotifications.length === 0 ? (
               <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                     <InboxIcon className="size-6" />
                  </div>
                  <div className="flex flex-col gap-1">
                     <p className="text-sm font-medium">All caught up</p>
                     <p className="max-w-xs text-sm text-muted-foreground">
                        You have no notifications right now. New mentions and updates will land
                        here.
                     </p>
                  </div>
               </div>
            ) : (
               filteredNotifications.map((notification) => (
                  <IssueLine
                     key={notification.id}
                     notification={notification}
                     isSelected={selectedNotification?.id === notification.id}
                     onClick={() => {
                        setSelectedNotification(notification);
                        // Padrão Linear: abrir a notificação já a marca como lida.
                        if (!notification.read) markAsRead(notification.id);
                     }}
                     showId={showId}
                     showStatusIcon={showStatusIcon}
                  />
               ))
            )}
         </div>
      </>
   );

   if (isMobile) {
      return selectedNotification ? (
         <div className="flex flex-col h-full w-full">
            <button
               onClick={() => setSelectedNotification(undefined)}
               className="flex items-center gap-1 px-4 h-10 border-b border-border text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
               <ChevronLeft className="size-4" />
               Inbox
            </button>
            <div className="flex-1 min-h-0">
               <NotificationPreview notification={selectedNotification} onMarkAsRead={markAsRead} onMarkAsUnread={markAsUnread} />
            </div>
         </div>
      ) : (
         <div className="flex flex-col h-full w-full">{listPane}</div>
      );
   }

   return (
      <ResizablePanelGroup
         direction="horizontal"
         autoSaveId="inbox-panel-group"
         className="w-full h-full"
      >
         {/* Tamanhos em % (react-resizable-panels). minSize = "menor tamanho": impede
             encolher a lista/detalhe a ponto de quebrar o layout ao arrastar o divisor. */}
         <ResizablePanel defaultSize={34} minSize={24} maxSize={48}>
            {listPane}
         </ResizablePanel>
         <ResizableHandle />
         <ResizablePanel defaultSize={66} minSize={40}>
            <NotificationPreview notification={selectedNotification} onMarkAsRead={markAsRead} onMarkAsUnread={markAsUnread} />
         </ResizablePanel>
      </ResizablePanelGroup>
   );
}
