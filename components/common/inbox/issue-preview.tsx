'use client';

import { IssueDetailView } from '@/components/common/issues/details/issue-details';
import { IssueDetailSkeleton } from '@/components/common/issues/details/issue-detail-skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getNotificationIcon } from '@/lib/notification-utils';
import { InboxItem } from '@/data/inbox';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { NotificationBox } from './icons/motification-box';

interface IssuePreviewProps {
   notification?: InboxItem;
   onMarkAsRead?: (id: string) => void;
   onMarkAsUnread?: (id: string) => void;
}

/** Contexto da notificação (quem/quando/o quê) exibido acima da issue. */
function NotificationContext({ notification }: { notification: InboxItem }) {
   return (
      <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg mb-8">
         <div className="relative shrink-0">
            <Avatar className="size-7">
               <AvatarImage
                  src={notification.user.avatarUrl || undefined}
                  alt={notification.user.name}
               />
               <AvatarFallback className="text-xs">{notification.user.name[0]}</AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-accent border border-background flex items-center justify-center">
               {getNotificationIcon(notification.type, 'size-2.5')}
            </div>
         </div>
         <div className="min-w-0 text-sm">
            <span className="font-medium">{notification.user.name}</span>{' '}
            <span className="text-muted-foreground">· {notification.timestamp}</span>
            <p className="text-foreground/90 mt-0.5">{notification.content}</p>
         </div>
      </div>
   );
}

/**
 * Inbox preview pane — paridade Linear: selecionar uma notificação abre a ISSUE
 * COMPLETA (título/descrição editáveis, sub-issues, feed com composer e a sidebar
 * de properties), com o contexto da notificação como banner no topo.
 */
export default function IssuePreview({
   notification,
   onMarkAsRead,
   onMarkAsUnread,
}: IssuePreviewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { getUnreadCount } = useNotificationsStore();
   const issues = useIssuesStore((s) => s.issues);

   // Issue viva atrás da notificação (o IssueDetailView precisa da issue do store).
   const issue = notification
      ? issues.find((candidate) => candidate.identifier === notification.identifier)
      : undefined;

   if (!notification) {
      const unreadCount = getUnreadCount();

      return (
         <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <NotificationBox className="w-16 h-16 mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">
               {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
               Select a notification from the list to view its details and take action.
            </p>
         </div>
      );
   }

   // Fallback pro header enquanto a issue não chegou no store (hidratando).
   const displayIssue = issue ?? notification;

   return (
      <div className="flex flex-col h-full overflow-hidden">
         {/* Header */}
         <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
               <displayIssue.status.icon />
               <span className="text-sm font-medium truncate">{displayIssue.identifier}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
               {!notification.read && onMarkAsRead && (
                  <Button
                     variant="outline"
                     size="xs"
                     onClick={() => onMarkAsRead(notification.id)}
                     className="gap-1"
                  >
                     <Check className="size-4" />
                     Mark as read
                  </Button>
               )}
               {notification.read && onMarkAsUnread && (
                  <Button
                     variant="outline"
                     size="xs"
                     onClick={() => onMarkAsUnread(notification.id)}
                     className="gap-1"
                  >
                     Mark as unread
                  </Button>
               )}
               <Button variant="ghost" size="xs" asChild>
                  <Link href={`/${orgId ?? 'nimbloo'}/issue/${displayIssue.identifier}`}>
                     Open
                     <ArrowUpRight className="size-3.5 ml-0.5" />
                  </Link>
               </Button>
            </div>
         </div>

         {/* Issue completa (padrão Linear) com o contexto da notificação no topo. */}
         <div className="flex-1 min-h-0 overflow-hidden">
            {issue ? (
               <IssueDetailView
                  issue={issue}
                  banner={<NotificationContext notification={notification} />}
               />
            ) : (
               // Issue ainda não hidratada no store → skeleton (resolve em instantes).
               <IssueDetailSkeleton />
            )}
         </div>
      </div>
   );
}
