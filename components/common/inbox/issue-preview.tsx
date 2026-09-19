'use client';

import {
   DetailPanelContainer,
   DetailPanelToggle,
   DetailSidePanelTrigger,
} from '@/components/common/detail-side-panel';
import { IssueDetailView } from '@/components/common/issues/details/issue-details';
import { IssueDetailSkeleton } from '@/components/common/issues/details/issue-detail-skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getNotificationIcon } from '@/lib/notification-utils';
import type { InboxLineItem } from './issue-line';
import { useRelativeTime } from '@/lib/relative-time';
import { useIssuesStore } from '@/store/issues-store';
import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { NotificationBox } from './icons/motification-box';
import type { ComponentType } from 'react';

/** Notificação do preview: a da linha + o status com ícone (quando a issue é conhecida). */
type InboxPreviewItem = Omit<InboxLineItem, 'status'> & {
   status?: { id: string; icon: ComponentType } | null;
};

interface IssuePreviewProps {
   notification?: InboxPreviewItem;
   onMarkAsRead?: (id: string) => void;
   onMarkAsUnread?: (id: string) => void;
}

/** Contexto da notificação (quem/quando/o quê) exibido acima da issue. */
function NotificationContext({ notification }: { notification: InboxPreviewItem }) {
   const when = useRelativeTime(notification.sortAt, notification.timestamp ?? '');
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
            <span className="text-muted-foreground">· {when}</span>
            <p className="text-foreground/90 mt-0.5">{notification.content}</p>
         </div>
      </div>
   );
}

/**
 * Inbox preview pane — paridade Linear: selecionar uma notificação abre a ISSUE
 * COMPLETA (título/descrição editáveis, sub-issues, feed com composer e a sidebar
 * de properties), com o contexto da notificação como banner no topo.
 *
 * O pane é um `DetailPanelContainer`: a sidebar de properties responde à largura do
 * PANE (redimensionável, bem mais estreito que a janela), não à do viewport — senão
 * ela abria em 400 px sobre um pane de 700 e esmagava o conteúdo. O toggle do painel
 * fica no cabeçalho do pane (mesmo estado persistido da página da issue).
 */
export default function IssuePreview({
   notification,
   onMarkAsRead,
   onMarkAsUnread,
}: IssuePreviewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   // Issue viva atrás da notificação (o IssueDetailView precisa da issue do store).
   // `find` DENTRO do seletor: evento de outra issue não re-renderiza o preview.
   const identifier = notification?.identifier;
   const issue = useIssuesStore((s) =>
      identifier ? s.issues.find((candidate) => candidate.identifier === identifier) : undefined
   );
   const issuesLoaded = useIssuesStore((s) => s.loaded);

   if (!notification) {
      return (
         <div className="flex h-full flex-col items-center justify-center gap-6 pb-7 text-center">
            <NotificationBox className="h-[100px] w-[97.5px] text-muted-foreground" />
            <p className="text-[13px] font-medium leading-4 text-muted-foreground">
               No notification selected
            </p>
         </div>
      );
   }

   // Fallback pro header enquanto a issue não chegou no store (ou está fora dele).
   const HeaderStatusIcon = (issue ?? notification).status?.icon;

   return (
      <DetailPanelContainer className="flex h-full flex-col overflow-hidden">
         {/* Header */}
         <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2 min-w-0">
               {HeaderStatusIcon && <HeaderStatusIcon />}
               <span className="text-sm font-medium truncate">{notification.identifier}</span>
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
                  <Link href={`/${orgId ?? 'nimbloo'}/issue/${notification.identifier}`}>
                     Open
                     <ArrowUpRight className="size-3.5 ml-0.5" />
                  </Link>
               </Button>
               <DetailPanelToggle kind="issue" />
               {/* O trigger do corpo da issue some no viewport `xl`; quando o pane ainda é
                   estreito (< @3xl) este cobre o vão para o Sheet continuar acessível. */}
               <DetailSidePanelTrigger kind="issue" className="hidden xl:@max-3xl:inline-flex" />
            </div>
         </div>

         {/* Issue completa (padrão Linear) com o contexto da notificação no topo. */}
         <div className="flex-1 min-h-0 overflow-hidden">
            {issue ? (
               <IssueDetailView
                  issue={issue}
                  banner={<NotificationContext notification={notification} />}
               />
            ) : issuesLoaded ? (
               // Issue fora do store (ex.: removida ou fora do escopo carregado): mostra o
               // contexto e o título, com o "Open" do cabeçalho para a página da issue.
               <div className="mx-auto max-w-3xl p-8">
                  <NotificationContext notification={notification} />
                  <h2 className="text-lg font-semibold">{notification.title}</h2>
               </div>
            ) : (
               // Issue ainda não hidratada no store → skeleton (resolve em instantes).
               <IssueDetailSkeleton />
            )}
         </div>
      </DetailPanelContainer>
   );
}
