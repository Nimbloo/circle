'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { User } from '@/data/users';
import { cn } from '@/lib/utils';
import { CircleUserRound } from 'lucide-react';

const SIZE = {
   xs: { avatar: 'size-[18px]', icon: 'size-4', overlap: '-space-x-1.5', text: 'text-[9px]' },
   sm: { avatar: 'size-5', icon: 'size-5', overlap: '-space-x-1.5', text: 'text-[10px]' },
   md: { avatar: 'size-6', icon: 'size-5', overlap: '-space-x-2', text: 'text-[10px]' },
} as const;

interface AssigneeAvatarsProps {
   /** Responsáveis na ordem de exibição (principal primeiro). */
   users: User[];
   size?: keyof typeof SIZE;
   /** Avatares visíveis antes do "+N". */
   max?: number;
   className?: string;
}

/** Nomes dos responsáveis para tooltip/aria ("Ana, Bob e Lia"). */
export function assigneeNames(users: User[]): string {
   const names = users.map((u) => u.name);
   if (names.length <= 1) return names[0] ?? '';
   return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/**
 * Avatares em pilha (#96): até `max` responsáveis sobrepostos + "+N" para o resto, com
 * tooltip listando todos os nomes. Sem responsável, mostra o placeholder de "Unassigned".
 */
export function AssigneeAvatars({ users, size = 'md', max = 3, className }: AssigneeAvatarsProps) {
   const s = SIZE[size];
   if (users.length === 0) {
      return (
         <span className={cn('flex items-center justify-center', s.avatar, className)}>
            <CircleUserRound className={cn('text-muted-foreground', s.icon)} />
         </span>
      );
   }
   const visible = users.slice(0, max);
   const rest = users.length - visible.length;
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span
               className={cn('flex items-center', s.overlap, className)}
               aria-label={`Assignees: ${assigneeNames(users)}`}
            >
               {visible.map((u) => (
                  <Avatar
                     key={u.id}
                     className={cn('shrink-0 ring-1 ring-background', s.avatar)}
                     data-testid="assignee-avatar"
                  >
                     <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                     <AvatarFallback className={s.text}>{u.name[0]}</AvatarFallback>
                  </Avatar>
               ))}
               {rest > 0 && (
                  <span
                     className={cn(
                        'flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium tabular-nums text-muted-foreground ring-1 ring-background',
                        s.avatar,
                        s.text
                     )}
                     data-testid="assignee-overflow"
                  >
                     +{rest}
                  </span>
               )}
            </span>
         </TooltipTrigger>
         <TooltipContent side="top">{assigneeNames(users)}</TooltipContent>
      </Tooltip>
   );
}
