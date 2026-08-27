'use client';

import { useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useNotificationsStore } from '@/store/notifications-store';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   DropdownMenuLabel,
   DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal, CheckCheck, ArrowUpDown, InboxIcon } from 'lucide-react';
import NotificationPreview from './issue-preview';
import IssueLine from './issue-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronLeft } from 'lucide-react';

export default function Inbox() {
   const {
      notifications,
      selectedNotification,
      setSelectedNotification,
      markAsRead,
      markAsUnread,
      markAllAsRead,
      snooze,
      getUnreadNotifications,
   } = useNotificationsStore();

   const isMobile = useIsMobile();
   const [showRead, setShowRead] = useState(true);
   const [showUnreadFirst, setShowUnreadFirst] = useState(false);
   const [ordering, setOrdering] = useState('newest');
   const [showId, setShowId] = useState(true);
   const [showStatusIcon, setShowStatusIcon] = useState(true);

   // Filter and sort notifications based on settings
   const filteredNotifications = notifications
      .filter((notification) => {
         if (!showRead && notification.read) return false;
         return true;
      })
      .sort((a, b) => {
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
            <div className="flex items-center gap-2">
               <SidebarTrigger className="inline-flex lg:hidden" />
               <h2 className="text-lg font-semibold">Inbox</h2>
            </div>

            <div className="flex items-center gap-2">
               <Button
                  variant="ghost"
                  size="xs"
                  onClick={markAllAsRead}
                  disabled={getUnreadNotifications().length === 0}
                  aria-label="Mark all as read"
               >
                  <CheckCheck className="w-4 h-4" />
               </Button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="xs" aria-label="Inbox options">
                        <SlidersHorizontal className="w-4 h-4" />
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
                           <Label htmlFor="show-read" className="text-sm">
                              Show read
                           </Label>
                           <Switch
                              id="show-read"
                              checked={showRead}
                              onCheckedChange={setShowRead}
                           />
                        </div>
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
         <div className="w-full flex flex-col items-center justify-start overflow-y-scroll h-[calc(100%-40px)] pb-0.25">
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
                     onSnooze={(hours) => snooze(notification.id, hours)}
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
      <ResizablePanelGroup
         direction="horizontal"
         autoSaveId="inbox-panel-group"
         className="w-full h-full"
      >
         <ResizablePanel defaultSize={350} maxSize={500}>
            {listPane}
         </ResizablePanel>
         <ResizableHandle withHandle />
         <ResizablePanel defaultSize={350} maxSize={500}>
            <NotificationPreview
               notification={selectedNotification}
               onMarkAsRead={markAsRead}
               onMarkAsUnread={markAsUnread}
            />
         </ResizablePanel>
      </ResizablePanelGroup>
   );
}
