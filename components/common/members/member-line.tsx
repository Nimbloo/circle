'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { User } from '@/data/users';
import { format, parseISO } from 'date-fns';
import { SquareUser } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MemberActions } from './member-actions';

interface MemberLineProps {
   user: User;
}

/** Joined date: ano corrente → "Mar 17", senão "Oct 2023". */
const joinedLabel = (iso: string) => {
   const date = parseISO(iso);
   return date.getFullYear() === new Date().getFullYear()
      ? format(date, 'MMM d')
      : format(date, 'MMM yyyy');
};

export default function MemberLine({ user }: MemberLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const isApplication = user.role === 'Application';

   const deactivated = Boolean(user.deactivatedAt);

   return (
      <div className="relative">
         {/* Ações do membro (#100) ficam FORA do Link — um dropdown dentro de um
             <a> não abre. Posicionado sobre a linha, à direita. */}
         <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
            <MemberActions user={user} />
         </div>
         <Link
            href={`/${orgId}/profiles/${user.id}`}
            className={cn(
               'h-[50px] pl-5 pr-6 flex w-full items-center gap-3 text-[13px] hover:bg-accent/40',
               deactivated && 'opacity-60'
            )}
         >
            {/* Name */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
               <Avatar className="size-7 shrink-0">
                  <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                  <AvatarFallback>{user.name[0]}</AvatarFallback>
               </Avatar>
               <div className="flex flex-col items-start overflow-hidden">
                  <span className="w-full truncate font-medium leading-4">{user.name}</span>
                  <span className="w-full truncate text-xs font-medium leading-[15px] text-muted-foreground">
                     {user.slug}
                  </span>
               </div>
            </div>

            {/* Email */}
            <div className="hidden lg:block w-[220px] shrink-0 text-xs text-muted-foreground truncate pr-2">
               {user.email}
            </div>

            {/* Status (role) */}
            <div className="w-[87px] shrink-0">
               {deactivated ? (
                  <span className="box-border inline-flex h-[19px] items-center rounded border border-border px-[3px] text-xs font-medium leading-[normal] text-muted-foreground">
                     Deactivated
                  </span>
               ) : isApplication ? (
                  <span className="text-xs text-muted-foreground">Application</span>
               ) : (
                  <span
                     className={cn(
                        'box-border inline-flex h-[19px] items-center rounded border px-[3px] text-xs font-medium leading-[normal]',
                        user.role === 'Admin'
                           ? 'text-indigo-500 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/5'
                           : 'text-muted-foreground'
                     )}
                  >
                     {user.role}
                  </span>
               )}
            </div>

            {/* Joined */}
            <div className="hidden lg:block w-[82px] shrink-0 text-xs text-muted-foreground">
               {joinedLabel(user.joinedDate)}
            </div>

            {/* Teams */}
            <div className="hidden md:flex w-[93px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground min-w-0">
               {user.teamIds.length > 0 && (
                  <>
                     <SquareUser className="size-3.5 shrink-0" />
                     <span className="truncate">
                        {user.teamIds.slice(0, 2).join(', ')}
                        {user.teamIds.length > 2 && ` +${user.teamIds.length - 2}`}
                     </span>
                  </>
               )}
            </div>

            {/* Last seen (Linear only shows currently-online members) */}
            <div className="hidden sm:flex w-[82px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               {user.status === 'online' && !isApplication && (
                  <>
                     <span className="size-1.5 rounded-full bg-[var(--online-indicator)]" />
                     Online
                  </>
               )}
            </div>
         </Link>
      </div>
   );
}
