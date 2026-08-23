'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusUserColors, User } from '@/data/users';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';
import { CheckIcon, CircleUserRound, UserIcon } from 'lucide-react';
import { useState } from 'react';

interface AssigneeUserProps {
   user: User | null;
   /** Issue-alvo: sem ele a troca não persiste (era um seletor morto). */
   issueId: string;
}

export function AssigneeUser({ user, issueId }: AssigneeUserProps) {
   const [open, setOpen] = useState(false);
   // Deriva do prop (store) — persiste via updateIssueAssignee e reverte junto no rollback.
   const currentAssignee = user;
   const users = useWorkspaceStore((s) => s.users);
   const updateIssueAssignee = useIssuesStore((s) => s.updateIssueAssignee);

   const assign = (next: User | null) => {
      setOpen(false);
      updateIssueAssignee(issueId, next);
   };

   const renderAvatar = () => {
      if (currentAssignee) {
         return (
            <Avatar className="size-6 shrink-0">
               <AvatarImage
                  src={currentAssignee.avatarUrl || undefined}
                  alt={currentAssignee.name}
               />
               <AvatarFallback>{currentAssignee.name[0]}</AvatarFallback>
            </Avatar>
         );
      } else {
         return (
            <div className="size-6 flex items-center justify-center">
               <CircleUserRound className="size-5 text-zinc-600" />
            </div>
         );
      }
   };

   return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
         <DropdownMenuTrigger asChild>
            <button className="relative w-fit focus:outline-none">
               {renderAvatar()}
               {currentAssignee && (
                  <span
                     className="border-background absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                     style={{ backgroundColor: statusUserColors[currentAssignee.status] }}
                  >
                     <span className="sr-only">{currentAssignee.status}</span>
                  </span>
               )}
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-[206px]">
            <DropdownMenuLabel>Assign to...</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(e) => {
                  e.stopPropagation();
                  assign(null);
               }}
            >
               <div className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  <span>No assignee</span>
               </div>
               {!currentAssignee && <CheckIcon className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {users.map((u) => (
               <DropdownMenuItem
                  key={u.id}
                  onClick={(e) => {
                     e.stopPropagation();
                     assign(u);
                  }}
               >
                  <div className="flex items-center gap-2">
                     <Avatar className="h-5 w-5">
                        <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                        <AvatarFallback>{u.name[0]}</AvatarFallback>
                     </Avatar>
                     <span>{u.name}</span>
                  </div>
                  {currentAssignee?.id === u.id && <CheckIcon className="ml-auto h-4 w-4" />}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
