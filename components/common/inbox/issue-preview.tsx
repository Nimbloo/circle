'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { ResourcesSection } from '@/components/common/issues/details/resources-section';
import { IssueReactionBar } from '@/components/common/issues/details/issue-reaction-bar';
import { AttachmentsSection } from '@/components/common/issues/details/attachments-section';
import { RelationEditor } from '@/components/common/issues/details/relation-editor';
import { AssigneeUser } from '@/components/common/issues/assignee-user';
import { IssuePropertiesPanel } from '@/components/common/issues/details/issue-properties-panel';
import { IssueContextMenu } from '@/components/common/issues/issue-context-menu';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DetailHeaderActions } from './detail-header-actions';
import { NotificationHeaderActions } from './notification-header-actions';
import { LabelBadge } from '@/components/common/issues/label-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getNotificationIcon } from '@/lib/notification-utils';
import type { IssueDetail } from '@/data/issue-details';
import { adaptIssueDetail } from '@/lib/adapters-issue-detail';
import { api } from '@/lib/client';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { InboxItem } from '@/data/inbox';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NotificationBox } from './icons/motification-box';

interface IssuePreviewProps {
   notification?: InboxItem;
   onMarkAsRead?: (id: string) => void;
   onMarkAsUnread?: (id: string) => void;
}

/**
 * Inbox preview pane: shows the REAL issue behind the selected
 * notification (live status/assignee from the store, rich description
 * from issue-details) plus the notification context.
 */
export default function IssuePreview({
   notification,
   onMarkAsRead,
   onMarkAsUnread,
}: IssuePreviewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { getUnreadCount } = useNotificationsStore();
   const issues = useIssuesStore((s) => s.issues);

   // Issue viva atrás da notificação (para status/assignee/labels em tempo real).
   const issue = notification
      ? issues.find((candidate) => candidate.identifier === notification.identifier)
      : undefined;
   const issueDetailId = issue?.id;

   const [detail, setDetail] = useState<IssueDetail | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   useEffect(() => {
      if (!issueDetailId) {
         setDetail(null);
         return;
      }
      let active = true;
      Promise.all([api.issues.detail(issueDetailId), api.issues.activity(issueDetailId)])
         .then(([detailDto, activity]) => {
            if (active) setDetail(adaptIssueDetail(detailDto, activity));
         })
         .catch(() => {
            if (active) setDetail(null);
         });
      return () => {
         active = false;
      };
   }, [issueDetailId, reloadKey]);

   // Realtime: refaz o fetch quando o SSE avisa que esta issue mudou (cross-usuário).
   useEffect(() => {
      if (!issueDetailId) return;
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (!id || id === issueDetailId) setReloadKey((k) => k + 1);
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
   }, [issueDetailId]);

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

   // Live issue from the store (falls back to the notification snapshot).
   const displayIssue = issue ?? notification;

   // Sub-issues + parent backlink (mesma derivação da página cheia).
   const subIssues =
      issue && detail
         ? (detail.subIssueIds ?? [])
              .map((id) => issues.find((c) => c.id === id))
              .filter((c): c is NonNullable<typeof c> => c !== undefined)
         : [];

   return (
      <div className="flex flex-col h-full overflow-hidden">
         {/* Header */}
         <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
               <displayIssue.status.icon />
               <span className="text-[13px] font-medium truncate">{displayIssue.identifier}</span>
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

               {/* Controles estilo Linear: favorite · ⋯ Issue options · sino (subscribe) */}
               {issue && detail && <DetailHeaderActions issue={issue} detail={detail} />}
               {/* Ações de notificação (canto): 💤 Snooze · 🗑 Delete */}
               <NotificationHeaderActions notification={notification} />
            </div>
         </div>

         {/* Preview + properties: grid estilo Linear. O bloco [mensagem | properties]
             é CENTRALIZADO como unidade (justify-center); a mensagem tem max-width e
             encolhe com a tela, o properties é FIXO e left-aligned, colado na "linha
             invisível" (o column-gap de 56px entre as duas colunas). Abaixo de xl vira
             coluna única (as properties aparecem inline via o bloco xl:hidden). */}
         <div className="flex-1 min-h-0 overflow-y-auto @container">
            {/* Grid 4 colunas estilo Linear: [1fr] [mensagem max] [properties] [1fr].
                Os spacers 1fr iguais centralizam o grupo mensagem|properties; a mensagem
                encolhe (minmax) e o properties é fixo, colado na "linha invisível" (o
                column-gap). Breakpoint por CONTAINER (@3xl≈768px) — não por viewport —
                pra reagir à largura REAL do painel (que no split 50% é estreito). Abaixo
                disso vira coluna única com as properties inline (bloco @3xl:hidden). */}
            <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,680px)_300px_minmax(0,1fr)] @3xl:gap-x-12 px-6 @3xl:px-0 pt-8 pb-6">
               <div className="min-w-0 @3xl:col-start-2">
                  {/* Notification context */}
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg mb-8">
                     <div className="relative shrink-0">
                        <Avatar className="size-7">
                           <AvatarImage
                              src={notification.user.avatarUrl || undefined}
                              alt={notification.user.name}
                           />
                           <AvatarFallback className="text-xs">
                              {notification.user.name[0]}
                           </AvatarFallback>
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

                  <h3 className="text-2xl font-semibold text-foreground text-balance">
                     {displayIssue.title}
                  </h3>

                  {/* Properties inline (só quando o container é estreito e o aside some) */}
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4 text-sm @3xl:hidden">
                     <span className="flex items-center gap-1.5">
                        <displayIssue.status.icon />
                        {displayIssue.status.name}
                     </span>
                     <span className="flex items-center gap-1.5 text-muted-foreground">
                        <displayIssue.priority.icon className="size-3.5" />
                        {displayIssue.priority.name}
                     </span>
                     {displayIssue.assignee && (
                        <span className="flex items-center gap-1.5">
                           <Avatar className="size-4">
                              <AvatarImage
                                 src={displayIssue.assignee.avatarUrl || undefined}
                                 alt={displayIssue.assignee.name}
                              />
                              <AvatarFallback className="text-[9px]">
                                 {displayIssue.assignee.name[0]}
                              </AvatarFallback>
                           </Avatar>
                           {displayIssue.assignee.name}
                        </span>
                     )}
                     <LabelBadge label={displayIssue.labels} />
                  </div>

                  {/* Real description */}
                  <div className="mt-6">
                     <ContentBlocks blocks={detail?.description ?? []} />
                  </div>

                  {issue && detail && (
                     <>
                        {/* Add reaction (emoji) + anexos — abaixo da descrição, estilo Linear */}
                        <div className="mt-4 flex flex-col gap-2">
                           <IssueReactionBar
                              issueId={issue.id}
                              reactions={detail.reactions ?? []}
                              onChanged={() => setReloadKey((k) => k + 1)}
                           />
                           <AttachmentsSection
                              issueId={issue.id}
                              attachments={detail.attachments ?? []}
                              onChanged={() => setReloadKey((k) => k + 1)}
                           />
                        </div>

                        {/* Sub-issues (lista rica + picker) — mesma experiência da página cheia */}
                        <div className="mt-8">
                           {subIssues.length > 0 && (
                              <>
                                 <h2 className="text-sm font-medium mb-1">
                                    Sub-issues{' '}
                                    <span className="text-muted-foreground">
                                       {
                                          subIssues.filter(
                                             (s) => s.status.category === 'completed'
                                          ).length
                                       }
                                       /{subIssues.length}
                                    </span>
                                 </h2>
                                 <div className="flex flex-col border-t border-border/50 mb-2">
                                    {subIssues.map((subIssue) => (
                                       <Link
                                          key={subIssue.id}
                                          href={`/${orgId ?? 'nimbloo'}/issue/${subIssue.identifier}`}
                                          className="flex items-center gap-2.5 h-10 px-1 border-b border-border/50 hover:bg-sidebar/50 text-[13px] min-w-0"
                                       >
                                          <subIssue.status.icon />
                                          <span className="text-muted-foreground shrink-0 text-xs font-medium">
                                             {subIssue.identifier}
                                          </span>
                                          <span className="truncate font-medium">
                                             {subIssue.title}
                                          </span>
                                          <span className="ml-auto shrink-0">
                                             <AssigneeUser
                                                user={subIssue.assignee}
                                                issueId={subIssue.id}
                                             />
                                          </span>
                                       </Link>
                                    ))}
                                 </div>
                              </>
                           )}
                           <RelationEditor
                              issueId={issue.id}
                              kind="sub"
                              relatedIds={detail.subIssueIds ?? []}
                              addLabel="Add sub-issues"
                              renderList={false}
                              onChanged={() => setReloadKey((k) => k + 1)}
                           />
                        </div>

                        {/* Resources (Add link / Add document) */}
                        <div className="mt-6">
                           <ResourcesSection
                              issueId={issue.id}
                              resources={detail.resources ?? []}
                              onChanged={() => setReloadKey((k) => k + 1)}
                           />
                        </div>

                        <div className="border-t border-border/60 mt-8" />

                        {/* Activity feed (eventos + comentários + reactions) + composer */}
                        <ActivityFeed
                           activity={detail.activity}
                           issueId={issue.id}
                           onCommentAdded={() => setReloadKey((k) => k + 1)}
                        />
                     </>
                  )}
               </div>

               {issue && detail && (
                  // Coluna de properties: FIXA (288px pela grid), left-aligned, colada
                  // na "linha invisível" (o column-gap). Sem border/fundo — a única
                  // divisão visível é lista|detalhe (fora deste grid). Right-click abre
                  // o MESMO menu do ⋯ "Issue options" (distinto do menu da lista inbox).
                  <ContextMenu>
                     <ContextMenuTrigger asChild>
                        <aside className="hidden @3xl:block @3xl:col-start-3 self-start">
                           <IssuePropertiesPanel
                              issue={issue}
                              detail={detail}
                              onChanged={() => setReloadKey((k) => k + 1)}
                           />
                        </aside>
                     </ContextMenuTrigger>
                     <IssueContextMenu issueId={issue.id} />
                  </ContextMenu>
               )}
            </div>
         </div>
      </div>
   );
}
