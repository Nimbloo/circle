'use client';

import { InboxItem } from '@/data/inbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { renderStatusIcon } from '@/lib/status-utils';
import { getNotificationIcon } from '@/lib/notification-utils';
import { useIssuesStore } from '@/store/issues-store';
import { Clock, RotateCcw } from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface IssueLineProps {
   notification: InboxItem;
   layoutId?: boolean;
   isSelected?: boolean;
   onClick?: () => void;
   onSnooze?: (hours: number) => void;
   onUnsnooze?: () => void;
   showId?: boolean;
   showStatusIcon?: boolean;
}

/** Opções de adiamento (paridade Linear): rótulo + horas. */
const SNOOZE_OPTIONS: { label: string; hours: number }[] = [
   { label: 'Em 1 hora', hours: 1 },
   { label: 'Em 4 horas', hours: 4 },
   { label: 'Amanhã', hours: 24 },
   { label: 'Próxima semana', hours: 168 },
];

/**
 * Linha de notificação — espelho do inbox do Linear: avatar 32px com badge do tipo
 * (ícone muted num chip da cor do fundo, canto inferior direito), linha 1 com
 * identifier + título em 13px (título branco quando não lida, muted quando lida) e
 * ícone de status à direita, linha 2 com o contexto em 12px + timestamp à direita.
 */
export default function IssueLine({
   notification,
   layoutId = false,
   isSelected = false,
   onClick,
   onSnooze,
   onUnsnooze,
   showId = true,
   showStatusIcon = true,
}: IssueLineProps) {
   // Status VIVO da issue (store) com fallback pro snapshot da notificação — o ícone
   // na linha acompanha mudanças de status em tempo real (padrão Linear).
   const liveStatusId = useIssuesStore(
      (s) => s.issues.find((i) => i.identifier === notification.identifier)?.status.id
   );
   const statusId = liveStatusId ?? notification.status.id;
   return (
      <motion.div
         {...(layoutId && { layoutId: `notification-line-${notification.id}` })}
         onClick={onClick}
         className="w-full pl-2.5"
      >
         <div className="group/inbox-line relative flex h-[55px] w-full cursor-pointer items-center gap-3 rounded-lg px-2">
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
                           onUnsnooze();
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
                                 key={opt.hours}
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    onSnooze(opt.hours);
                                 }}
                              >
                                 <Clock className="size-3.5 text-muted-foreground" />
                                 {opt.label}
                              </DropdownMenuItem>
                           ))}
                        </DropdownMenuContent>
                     </DropdownMenu>
                  )}

                  {showStatusIcon && (
                     <div className="flex shrink-0 items-center">{renderStatusIcon(statusId)}</div>
                  )}
               </div>

               <div className="mt-[3px] flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                     {notification.content}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                     {notification.timestamp}
                  </span>
               </div>
            </div>
         </div>
      </motion.div>
   );
}
