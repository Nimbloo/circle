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
   DropdownMenuSeparator,
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
   const [custom, setCustom] = useState('');

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
            <DropdownMenuContent align="end" className="w-52">
               {snoozePresets().map((p) => (
                  <DropdownMenuItem
                     key={p.label}
                     onClick={() => snoozeNotification(notification.id, p.at)}
                  >
                     {p.label}
                  </DropdownMenuItem>
               ))}
               <DropdownMenuSeparator />
               {/* Custom: data/hora arbitrária (o item não fecha ao interagir com o input) */}
               <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <label className="mb-1 block text-xs text-muted-foreground">
                     Custom date &amp; time
                  </label>
                  <input
                     type="datetime-local"
                     value={custom}
                     onChange={(e) => setCustom(e.target.value)}
                     onClick={(e) => e.stopPropagation()}
                     className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none"
                  />
                  <Button
                     size="xs"
                     className="mt-1.5 w-full"
                     disabled={!custom}
                     onClick={() => {
                        const at = new Date(custom);
                        if (!isNaN(at.getTime())) snoozeNotification(notification.id, at);
                     }}
                  >
                     Snooze until…
                  </Button>
               </div>
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
