'use client';

import { InboxItem } from '@/data/inbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { renderStatusIcon } from '@/lib/status-utils';
import { getNotificationIcon } from '@/lib/notification-utils';
import { Clock } from 'lucide-react';
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

export default function IssueLine({
   notification,
   layoutId = false,
   isSelected = false,
   onClick,
   onSnooze,
   showId = true,
   showStatusIcon = true,
}: IssueLineProps) {
   return (
      <motion.div
         {...(layoutId && { layoutId: `notification-line-${notification.id}` })}
         onClick={onClick}
         className="w-full px-0.75 py-0.25"
      >
         <div
            className={cn(
               'group/inbox-line w-full flex items-center gap-3 px-3 py-2.5 hover:bg-sidebar/80 dark:hover:bg-sidebar/50 transition-colors cursor-pointer rounded-lg',
               isSelected && 'bg-accent/80 dark:bg-accent/50'
            )}
         >
            <div className="relative flex-shrink-0">
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

               <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-accent border-2 border-background flex items-center justify-center">
                  {getNotificationIcon(notification.type, 'size-3')}
               </div>
            </div>

            <div className="w-full">
               <div className="flex items-center gap-1.5">
                  {!notification.read && (
                     <div className="size-2 bg-blue-500 rounded-full flex-shrink-0" />
                  )}
                  {showId && (
                     <span
                        className={cn(
                           'text-sm font-medium text-muted-foreground shrink-0',
                           notification.read && 'opacity-50'
                        )}
                     >
                        {notification.identifier}
                     </span>
                  )}

                  <h4
                     className={cn(
                        'text-sm font-medium text-foreground line-clamp-1 flex-grow',
                        notification.read && 'opacity-50'
                     )}
                  >
                     {notification.title}
                  </h4>

                  {onSnooze && (
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <button
                              type="button"
                              aria-label="Adiar notificação"
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 size-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover/inbox-line:opacity-100 hover:bg-accent focus:opacity-100 transition-opacity"
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
                     <div className="shrink-0">{renderStatusIcon(notification.status.id)}</div>
                  )}
               </div>

               <div
                  className={cn(
                     'flex items-center justify-between gap-1.5 transition-opacity duration-200',
                     notification.read && 'opacity-50'
                  )}
               >
                  <p className="text-sm text-muted-foreground line-clamp-1">
                     {notification.content}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0">
                     {notification.timestamp}
                  </span>
               </div>
            </div>
         </div>
      </motion.div>
   );
}
