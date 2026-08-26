'use client';

import {
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
   ContextMenuSub,
   ContextMenuSubContent,
   ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { InboxItem } from '@/data/inbox';
import { api } from '@/lib/client';
import { branchName } from '@/components/common/issues/issue-menu-items';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   Check,
   Circle,
   Clock,
   Clipboard,
   BellOff,
   Star,
   Trash2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

/** Presets de snooze (estilo Linear): computados no cliente a partir de agora. */
export function snoozePresets(): { label: string; at: Date }[] {
   const now = new Date();
   const at = (base: Date, h: number) => {
      const d = new Date(base);
      d.setHours(h, 0, 0, 0);
      return d;
   };
   const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000);
   const tomorrow = at(new Date(now.getTime() + 24 * 60 * 60 * 1000), 9);
   // Próximo sábado 09:00
   const weekend = at(now, 9);
   weekend.setDate(weekend.getDate() + ((6 - weekend.getDay() + 7) % 7 || 7));
   // Próxima segunda 09:00
   const nextWeek = at(now, 9);
   nextWeek.setDate(nextWeek.getDate() + ((1 - nextWeek.getDay() + 7) % 7 || 7));
   return [
      { label: 'Later today', at: laterToday },
      { label: 'Tomorrow', at: tomorrow },
      { label: 'This weekend', at: weekend },
      { label: 'Next week', at: nextWeek },
   ];
}

/**
 * Menu de right-click do ITEM da inbox (notification-centric) — DISTINTO do menu de
 * "Issue options" das properties. Ações de notificação: marcar lida/não-lida, excluir,
 * adiar (snooze), e atalhos de issue (unsubscribe/favorite/copy). Tudo com backend.
 */
export function NotificationContextMenu({
   notification,
   issueId,
}: {
   notification: InboxItem;
   issueId?: string;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const me = useWorkspaceStore((s) => s.me);
   const getIssueById = useIssuesStore((s) => s.getIssueById);
   const { markAsRead, markAsUnread, deleteNotification, snoozeNotification } =
      useNotificationsStore();

   const issue = issueId ? getIssueById(issueId) : undefined;

   const copy = (text: string, msg: string) =>
      void navigator.clipboard.writeText(text).then(() => toast.success(msg));

   const handleUnsubscribe = () => {
      if (!issueId) return;
      api.issues
         .unsubscribe(issueId)
         .then(() => toast.success('Você não segue mais esta issue'))
         .catch(() => toast.error('Falha ao deixar de seguir'));
   };
   const handleFavorite = () => {
      if (!issueId) return;
      api.issues
         .toggleFavorite(issueId)
         .then((r) => toast.success(r.favorited ? 'Adicionado aos favoritos' : 'Removido dos favoritos'))
         .catch(() => toast.error('Falha ao favoritar'));
   };

   return (
      <ContextMenuContent className="w-60">
         {notification.read ? (
            <ContextMenuItem onClick={() => markAsUnread(notification.id)}>
               <Circle className="size-4" /> Mark as unread
               <ContextMenuShortcut>U</ContextMenuShortcut>
            </ContextMenuItem>
         ) : (
            <ContextMenuItem onClick={() => markAsRead(notification.id)}>
               <Check className="size-4" /> Mark as read
               <ContextMenuShortcut>U</ContextMenuShortcut>
            </ContextMenuItem>
         )}

         <ContextMenuItem onClick={() => deleteNotification(notification.id)}>
            <Trash2 className="size-4" /> Delete notification
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuSub>
            <ContextMenuSubTrigger>
               <Clock className="mr-2 size-4" /> Snooze
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
               {snoozePresets().map((p) => (
                  <ContextMenuItem
                     key={p.label}
                     onClick={() => snoozeNotification(notification.id, p.at)}
                  >
                     {p.label}
                  </ContextMenuItem>
               ))}
            </ContextMenuSubContent>
         </ContextMenuSub>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={handleUnsubscribe} disabled={!issueId}>
            <BellOff className="size-4" /> Unsubscribe
         </ContextMenuItem>
         <ContextMenuItem onClick={handleFavorite} disabled={!issueId}>
            <Star className="size-4" /> Favorite
         </ContextMenuItem>

         <ContextMenuSub>
            <ContextMenuSubTrigger>
               <Clipboard className="mr-2 size-4" /> Copy
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
               <ContextMenuItem
                  disabled={!issue}
                  onClick={() =>
                     issue &&
                     copy(
                        `${window.location.origin}/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`,
                        'Link copiado'
                     )
                  }
               >
                  Copy issue link
               </ContextMenuItem>
               <ContextMenuItem
                  disabled={!issue}
                  onClick={() => issue && copy(issue.identifier, 'ID copiado')}
               >
                  Copy issue ID
               </ContextMenuItem>
               <ContextMenuItem
                  disabled={!issue}
                  onClick={() =>
                     issue && copy(branchName(me?.name, issue.identifier, issue.title), 'Branch name copiado')
                  }
               >
                  Copy git branch name
               </ContextMenuItem>
            </ContextMenuSubContent>
         </ContextMenuSub>
      </ContextMenuContent>
   );
}
