'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
} from '@/components/ui/dropdown-menu';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
   Bell,
   CheckCheck,
   CheckIcon,
   ChevronLeft,
   ChevronRight,
   ListFilter,
   MoreHorizontal,
   SlidersHorizontal,
} from 'lucide-react';
import { getNotificationIcon } from '@/lib/notification-utils';
import type { NotificationType } from '@/data/inbox';
import NotificationPreview from './issue-preview';
import IssueLine from './issue-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCommandPages } from '@/components/ui/use-command-pages';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
   clampInboxListWidth,
   DEFAULT_INBOX_LIST_WIDTH,
   useInboxLayoutStore,
} from '@/store/inbox-layout-store';
import type { ImperativePanelHandle } from 'react-resizable-panels';

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
   const desktopContainerRef = useRef<HTMLDivElement>(null);
   const listPanelRef = useRef<ImperativePanelHandle>(null);
   const [desktopWidth, setDesktopWidth] = useState(0);
   const listWidth = useInboxLayoutStore((state) => state.listWidth);
   const setListWidth = useInboxLayoutStore((state) => state.setListWidth);
   // Snoozed deixou de ser aba: vira o toggle "Show snoozed" do Display options
   // (paridade Linear) — as adiadas entram na própria lista, com o botão Restaurar.
   const [showSnoozed, setShowSnoozed] = useState(false);
   const [showRead, setShowRead] = useState(true);
   const [showUnreadFirst, setShowUnreadFirst] = useState(false);
   const [ordering, setOrdering] = useState('newest');
   const [showId, setShowId] = useState(true);
   const [showStatusIcon, setShowStatusIcon] = useState(true);
   const [filterOpen, setFilterOpen] = useState(false);
   const filterNavigation = useCommandPages<'root' | 'notification-type'>('root', () =>
      setFilterOpen(false)
   );
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

   useEffect(() => {
      const container = desktopContainerRef.current;
      if (!container || isMobile) return;

      const measure = () => setDesktopWidth(container.getBoundingClientRect().width);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
   }, [isMobile]);

   useLayoutEffect(() => {
      if (!desktopWidth) return;
      const nextWidth = clampInboxListWidth(listWidth, desktopWidth);
      listPanelRef.current?.resize((nextWidth / desktopWidth) * 100);
   }, [desktopWidth, listWidth]);

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
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Notification actions"
                     >
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
               <Popover
                  open={filterOpen}
                  onOpenChange={(next) => {
                     setFilterOpen(next);
                     if (!next) filterNavigation.reset();
                  }}
               >
                  <PopoverTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="relative size-7"
                        aria-label="Add filter"
                     >
                        <ListFilter className="size-4 text-muted-foreground" />
                        {typeFilter.size > 0 && (
                           <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                              {typeFilter.size}
                           </span>
                        )}
                     </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-0">
                     <Command onKeyDown={filterNavigation.onKeyDown}>
                        <CommandInput
                           ref={filterNavigation.searchInputRef}
                           value={filterNavigation.query}
                           onValueChange={filterNavigation.setQuery}
                           placeholder={
                              filterNavigation.page === 'root' ? 'Add Filter…' : 'Filter…'
                           }
                        />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           {filterNavigation.page === 'root' ? (
                              <CommandGroup>
                                 <CommandItem
                                    data-command-page="notification-type"
                                    onSelect={() => filterNavigation.push('notification-type')}
                                 >
                                    <Bell className="size-4 text-muted-foreground" />
                                    Notification type
                                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                                 </CommandItem>
                                 {typeFilter.size > 0 && (
                                    <CommandItem onSelect={() => setTypeFilter(new Set())}>
                                       Clear filters
                                    </CommandItem>
                                 )}
                              </CommandGroup>
                           ) : (
                              <CommandGroup>
                                 {TYPE_LABELS.map((type) => (
                                    <CommandItem
                                       key={type.value}
                                       onSelect={() => toggleType(type.value)}
                                    >
                                       <span className="mr-0.5 inline-flex">
                                          {getNotificationIcon(
                                             type.value,
                                             'size-3.5 text-muted-foreground'
                                          )}
                                       </span>
                                       {type.label}
                                       {typeFilter.has(type.value) && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           )}
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Display options"
                     >
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

   const minimumSize = desktopWidth ? (DEFAULT_INBOX_LIST_WIDTH / desktopWidth) * 100 : 20;
   const maximumSize = Math.max(minimumSize, 50);

   return (
      <div ref={desktopContainerRef} className="h-full w-full">
         <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            <ResizablePanel
               ref={listPanelRef}
               id="inbox-list"
               order={1}
               defaultSize={minimumSize}
               minSize={minimumSize}
               maxSize={maximumSize}
               onResize={(size) => {
                  if (!desktopWidth) return;
                  setListWidth(clampInboxListWidth((size / 100) * desktopWidth, desktopWidth));
               }}
               className="min-w-[300px]"
            >
               <section className="h-full min-w-0">{listPane}</section>
            </ResizablePanel>
            <ResizableHandle
               id="inbox-list-resize-handle"
               aria-label="Resize notification list"
               hitAreaMargins={{ fine: 3, coarse: 12 }}
            />
            <ResizablePanel
               id="inbox-detail"
               order={2}
               defaultSize={100 - minimumSize}
               minSize={30}
            >
               <section className="h-full min-w-0">
                  <NotificationPreview
                     notification={selectedNotification}
                     onMarkAsRead={markAsRead}
                     onMarkAsUnread={markAsUnread}
                  />
               </section>
            </ResizablePanel>
         </ResizablePanelGroup>
      </div>
   );
}
