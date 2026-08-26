'use client';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InboxItem } from '@/data/inbox';
import { useNotificationsStore } from '@/store/notifications-store';
import { Clock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { snoozePresets } from './notification-context-menu';

/**
 * Ações de NOTIFICAÇÃO na barra de título do detalhe do inbox (estilo Linear, no canto):
 * 💤 Snooze (com presets) e 🗑 Delete notification. Operam sobre a notificação (não a
 * issue) — backend real via store (snooze/delete).
 */
export function NotificationHeaderActions({ notification }: { notification: InboxItem }) {
   const snoozeNotification = useNotificationsStore((s) => s.snoozeNotification);
   const deleteNotification = useNotificationsStore((s) => s.deleteNotification);
   const [confirmOpen, setConfirmOpen] = useState(false);

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Snooze notification"
                  title="Snooze notification"
               >
                  <Clock className="size-4" />
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
               {snoozePresets().map((p) => (
                  <DropdownMenuItem
                     key={p.label}
                     onClick={() => snoozeNotification(notification.id, p.at)}
                  >
                     {p.label}
                  </DropdownMenuItem>
               ))}
            </DropdownMenuContent>
         </DropdownMenu>

         <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Delete notification"
            title="Delete notification"
            onClick={() => setConfirmOpen(true)}
         >
            <Trash2 className="size-4" />
         </Button>

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete notification?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Esta notificação será removida do seu inbox. A issue não é afetada.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     className={buttonVariants({ variant: 'destructive' })}
                     onClick={() => deleteNotification(notification.id)}
                  >
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
