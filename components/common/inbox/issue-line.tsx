'use client';

import type { NotificationType } from '@/data/inbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/relative-time';
import { renderStatusIcon } from '@/lib/status-utils';
import { getNotificationIcon } from '@/lib/notification-utils';
import { Clock, RotateCcw } from 'lucide-react';
import { memo } from 'react';
import { SNOOZE_OPTIONS, snoozeUntilIso } from './snooze-options';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** O que a linha precisa de uma notificação (o `InboxNotification` do store satisfaz). */
export interface InboxLineItem {
   id: string;
   identifier: string;
   title: string;
   read: boolean;
   type: NotificationType;
   content: string;
   user: { name: string; avatarUrl: string };
   /** Snapshot do status da issue (null quando a issue não está no store). */
   status?: { id: string } | null;
   /** ISO da notificação — o tempo relativo é calculado com `now`. */
   sortAt?: string;
   /** Relativo pré-calculado (fallback quando não há `sortAt`). */
   timestamp?: string;
}

interface IssueLineProps<T extends InboxLineItem> {
   notification: T;
   /** "Agora" do tick compartilhado (o tempo relativo anda sem re-hidratar). */
   now?: number;
   /** Status VIVO da issue (mapa do pai); ausente = snapshot da notificação. */
   statusId?: string;
   isSelected?: boolean;
   /** Handlers ESTÁVEIS que recebem a própria notificação — mantêm o `memo` da linha. */
   onOpen?: (notification: T) => void;
   /** Adia até o instante ISO (opções de `snooze-options.ts`). */
   onSnooze?: (id: string, until: string) => void;
   onUnsnooze?: (id: string) => void;
   showId?: boolean;
   showStatusIcon?: boolean;
   /** Saindo da lista (adiada/excluída): colapsa a altura antes de sumir. */
   leaving?: boolean;
}

/**
 * Linha de notificação — espelho do inbox do Linear: avatar 32px com badge do tipo
 * (ícone muted num chip da cor do fundo, canto inferior direito), linha 1 com
 * identifier + título em 13px (título branco quando não lida, muted quando lida) e
 * ícone de status à direita, linha 2 com o contexto em 12px + timestamp à direita.
 */
function IssueLine<T extends InboxLineItem>({
   notification,
   now,
   statusId: liveStatusId,
   isSelected = false,
   onOpen,
   onSnooze,
   onUnsnooze,
   showId = true,
   showStatusIcon = true,
   leaving = false,
}: IssueLineProps<T>) {
   // Status VIVO da issue com fallback pro snapshot da notificação — o ícone na linha
   // acompanha mudanças de status em tempo real (padrão Linear).
   const statusId = liveStatusId ?? notification.status?.id;
   const when = notification.sortAt
      ? relativeTime(notification.sortAt, now)
      : (notification.timestamp ?? '');
   return (
      <div
         onClick={onOpen ? () => onOpen(notification) : undefined}
         aria-hidden={leaving || undefined}
         // Saída da lista (co#9): a linha tem 55 px fixos, então colapsa a altura + opacity.
         className={cn(
            'h-[55px] w-full overflow-hidden pl-2.5 transition-[height,opacity] duration-150 ease-in motion-reduce:transition-none',
            leaving && 'pointer-events-none h-0 opacity-0'
         )}
      >
         <div
            data-notification-id={notification.id}
            // Focável e abrível pelo teclado (co#16); a seleção é anunciada.
            tabIndex={onOpen ? 0 : -1}
            aria-current={isSelected || undefined}
            onKeyDown={
               onOpen
                  ? (e) => {
                       if (e.target !== e.currentTarget) return;
                       if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpen(notification);
                       }
                    }
                  : undefined
            }
            className="group/inbox-line relative flex h-[55px] w-full cursor-pointer items-center gap-3 rounded-lg px-2 outline-none focus-visible:ring-1 focus-visible:ring-ring"
         >
            {/* Realce que DISSIPA nas pontas (Linear): camada de fundo com máscara de
                gradiente horizontal — o fill some suavemente nas bordas laterais. */}
            <div
               className={cn(
                  'pointer-events-none absolute inset-0 rounded-lg transition-opacity duration-150 [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]',
                  isSelected
                     ? 'bg-accent/80 opacity-100 dark:bg-accent/60'
                     : 'bg-sidebar/80 opacity-0 group-hover/inbox-line:opacity-100 dark:bg-sidebar/50'
               )}
            />
            <div className="relative shrink-0">
               <Avatar className="size-8">
                  <AvatarImage
                     src={notification.user.avatarUrl || undefined}
                     alt={notification.user.name}
                  />
                  <AvatarFallback className="text-xs">
                     {notification.user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                  </AvatarFallback>
               </Avatar>
               {/* Badge do tipo — chip da cor do fundo com o ícone em muted (Linear). */}
               <div className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-background">
                  {getNotificationIcon(notification.type, 'size-3 text-muted-foreground')}
               </div>
            </div>

            {/* relative: pinta acima da camada de realce (positioned > estático). */}
            <div className="relative min-w-0 flex-1">
               <div className="flex items-center gap-1.5">
                  {showId && (
                     <span className="shrink-0 text-[13px] text-muted-foreground">
                        {notification.identifier}
                     </span>
                  )}

                  <h4
                     className={cn(
                        'min-w-0 flex-1 truncate text-[13px] font-medium',
                        notification.read ? 'text-muted-foreground' : 'text-foreground'
                     )}
                  >
                     {notification.title}
                  </h4>

                  {onUnsnooze && (
                     <button
                        type="button"
                        aria-label="Desfazer adiamento"
                        onClick={(e) => {
                           e.stopPropagation();
                           onUnsnooze(notification.id);
                        }}
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus:opacity-100 group-hover/inbox-line:opacity-100"
                     >
                        <RotateCcw className="size-3.5" />
                        Restaurar
                     </button>
                  )}
                  {onSnooze && (
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <button
                              type="button"
                              aria-label="Adiar notificação"
                              onClick={(e) => e.stopPropagation()}
                              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus:opacity-100 group-hover/inbox-line:opacity-100"
                           >
                              <Clock className="size-3.5" />
                           </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                           {SNOOZE_OPTIONS.map((opt) => (
                              <DropdownMenuItem
                                 key={opt.label}
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    onSnooze(notification.id, snoozeUntilIso(opt));
                                 }}
                              >
                                 <Clock className="size-3.5 text-muted-foreground" />
                                 {opt.label}
                              </DropdownMenuItem>
                           ))}
                        </DropdownMenuContent>
                     </DropdownMenu>
                  )}

                  {showStatusIcon && statusId && (
                     <div className="flex shrink-0 items-center">{renderStatusIcon(statusId)}</div>
                  )}
               </div>

               <div className="mt-[3px] flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                     {notification.content}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
               </div>
            </div>
         </div>
      </div>
   );
}

/** Memoizada: evento de outra issue/notificação não re-renderiza as demais linhas. */
export default memo(IssueLine) as typeof IssueLine;
