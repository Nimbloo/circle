'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
   CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { statusUserColors, User } from '@/data/users';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';
import { CheckIcon, UserIcon, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AssigneeAvatars, assigneeNames } from './assignee-avatars';

interface AssigneeUserProps {
   /** Todos os responsáveis (principal primeiro). */
   users?: User[];
   /** Compat single-assignee: usado só quando `users` não é passado. */
   user?: User | null;
   /** Issue-alvo: sem ele a troca não persiste (era um seletor morto). */
   issueId: string;
   /** Avatar de 18px usado no canto superior dos cards do board. */
   compact?: boolean;
}

/**
 * Responsáveis de uma issue nas linhas/cards (#96): pilha de avatares + multi-select
 * (checkbox por membro, busca, "Assign to me" alterna o próprio). Cada toggle persiste
 * na hora (otimista + rollback no store); o popover fica aberto para marcar vários.
 */
export function AssigneeUser({ users, user, issueId, compact = false }: AssigneeUserProps) {
   const [open, setOpen] = useState(false);
   // Deriva do prop (store) — persiste via updateIssueAssignees e reverte junto no rollback.
   const assignees = users ?? (user ? [user] : []);
   const members = useWorkspaceStore((s) => s.users);
   const meId = useWorkspaceStore((s) => s.me?.id);
   const updateIssueAssignees = useIssuesStore((s) => s.updateIssueAssignees);

   const isSelected = (id: string) => assignees.some((a) => a.id === id);
   const toggle = (member: User) => {
      const next = isSelected(member.id)
         ? assignees.filter((a) => a.id !== member.id)
         : [...assignees, member];
      void updateIssueAssignees(issueId, next).catch(() => undefined);
   };
   const clear = () => {
      setOpen(false);
      void updateIssueAssignees(issueId, []).catch(() => undefined);
   };
   const me = meId ? members.find((m) => m.id === meId) : undefined;
   const single = assignees.length === 1 ? assignees[0] : null;

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               aria-label={
                  assignees.length
                     ? `Change assignees: ${assigneeNames(assignees)}`
                     : 'Assign issue'
               }
               className={cn('relative w-fit focus:outline-none', compact && 'h-[18px]')}
               onClick={(e) => e.stopPropagation()}
            >
               <AssigneeAvatars users={assignees} size={compact ? 'xs' : 'md'} />
               {single && (
                  <span
                     className="border-background absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                     style={{ backgroundColor: statusUserColors[single.status] }}
                  >
                     <span className="sr-only">{single.status}</span>
                  </span>
               )}
            </button>
         </PopoverTrigger>
         <PopoverContent
            align="start"
            className="w-[240px] p-0"
            onClick={(e) => e.stopPropagation()}
         >
            <Command>
               <CommandInput placeholder="Assign to..." />
               <CommandList>
                  <CommandEmpty>No members found.</CommandEmpty>
                  <CommandGroup>
                     {me && (
                        <CommandItem
                           value="assign-to-me"
                           keywords={['me', me.name]}
                           onSelect={() => toggle(me)}
                           className="flex items-center justify-between"
                        >
                           <div className="flex items-center gap-2">
                              <UserRoundCheck className="size-4 text-muted-foreground" />
                              <span>Assign to me</span>
                           </div>
                           {isSelected(me.id) && <CheckIcon className="ml-auto size-4" />}
                        </CommandItem>
                     )}
                     <CommandItem
                        value="no-assignee"
                        keywords={['unassigned', 'none']}
                        onSelect={clear}
                        className="flex items-center justify-between"
                     >
                        <div className="flex items-center gap-2">
                           <UserIcon className="size-4 text-muted-foreground" />
                           <span>No assignee</span>
                        </div>
                        {assignees.length === 0 && <CheckIcon className="ml-auto size-4" />}
                     </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup>
                     {members.map((m) => (
                        <CommandItem
                           key={m.id}
                           value={m.id}
                           keywords={[m.name, m.email]}
                           onSelect={() => toggle(m)}
                           className="flex items-center justify-between"
                        >
                           <div className="flex items-center gap-2">
                              <Avatar className="size-5">
                                 <AvatarImage src={m.avatarUrl || undefined} alt={m.name} />
                                 <AvatarFallback>{m.name[0]}</AvatarFallback>
                              </Avatar>
                              <span>{m.name}</span>
                           </div>
                           {isSelected(m.id) && <CheckIcon className="ml-auto size-4" />}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}
