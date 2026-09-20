'use client';

import { Button } from '@/components/ui/button';
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
import { useWorkspaceStore } from '@/store/workspace-store';
import { activeUsers, User } from '@/data/users';
import { CheckIcon, UserCircle, UserRoundCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AssigneeAvatars } from '@/components/common/issues/assignee-avatars';
import type { Issue } from '@/data/issues';
import { IssueCounts } from '@/components/common/issues/issue-counts';

const NO_ASSIGNEE = '__none__';
const byAssignee = (issue: Issue) => {
   const ids = (issue.assignees ?? []).map((a) => a.id);
   return issue.assignee === null ? [NO_ASSIGNEE, ...ids] : ids;
};

interface AssigneeSelectorProps {
   /** Responsáveis selecionados (principal primeiro). */
   assignees: User[];
   /** Recebe o conjunto inteiro a cada toggle; o 1º é o principal. */
   onChange: (assignees: User[]) => void;
}

/**
 * Multi-select de responsáveis (#96) do modal de criação e da sidebar de propriedades:
 * checkbox por membro, busca, "Assign to me" alterna o próprio. Fica aberto ao marcar.
 */
export function AssigneeSelector({ assignees, onChange }: AssigneeSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);

   // Membros desativados (#100) não podem receber issue nova.
   const users = activeUsers(useWorkspaceStore((s) => s.users));
   const meId = useWorkspaceStore((s) => s.me?.id);
   const me = meId ? users.find((u) => u.id === meId) : undefined;

   const isSelected = (userId: string) => assignees.some((a) => a.id === userId);
   const toggle = (user: User) => {
      onChange(
         isSelected(user.id) ? assignees.filter((a) => a.id !== user.id) : [...assignees, user]
      );
   };
   const clear = () => {
      onChange([]);
      setOpen(false);
   };

   const label =
      assignees.length === 0
         ? 'Unassigned'
         : assignees.length === 1
           ? assignees[0].name
           : `${assignees[0].name} +${assignees.length - 1}`;

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center"
                  size="xs"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={open}
                  aria-label={`Assignees: ${label}`}
               >
                  {assignees.length ? (
                     <AssigneeAvatars users={assignees} size="sm" />
                  ) : (
                     <UserCircle className="size-5" />
                  )}
                  <span>{label}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <IssueCounts by={byAssignee}>
                  {(counts) => (
                     <Command>
                        <CommandInput placeholder="Assign to..." />
                        <CommandList>
                           <CommandEmpty>No users found.</CommandEmpty>
                           <CommandGroup>
                              {me && (
                                 <CommandItem
                                    value="assign-to-me"
                                    keywords={['me', me.name]}
                                    onSelect={() => toggle(me)}
                                    className="flex items-center justify-between"
                                 >
                                    <div className="flex items-center gap-2">
                                       <UserRoundCheck className="size-5 text-muted-foreground" />
                                       Assign to me
                                    </div>
                                    {isSelected(me.id) && (
                                       <CheckIcon size={16} className="ml-auto" />
                                    )}
                                 </CommandItem>
                              )}
                              <CommandItem
                                 value="unassigned"
                                 keywords={['none', 'no assignee']}
                                 onSelect={clear}
                                 className="flex items-center justify-between"
                              >
                                 <div className="flex items-center gap-2">
                                    <UserCircle className="size-5" />
                                    Unassigned
                                 </div>
                                 {assignees.length === 0 && (
                                    <CheckIcon size={16} className="ml-auto" />
                                 )}
                                 <span className="text-muted-foreground text-xs">
                                    {counts.get(NO_ASSIGNEE) ?? 0}
                                 </span>
                              </CommandItem>
                           </CommandGroup>
                           <CommandSeparator />
                           <CommandGroup>
                              {users.map((user) => (
                                 <CommandItem
                                    key={user.id}
                                    value={user.id}
                                    keywords={[user.name, user.email]}
                                    onSelect={() => toggle(user)}
                                    className="flex items-center justify-between"
                                 >
                                    <div className="flex items-center gap-2">
                                       <Avatar className="size-5">
                                          <AvatarImage
                                             src={user.avatarUrl || undefined}
                                             alt={user.name}
                                          />
                                          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                       </Avatar>
                                       {user.name}
                                    </div>
                                    {isSelected(user.id) && (
                                       <CheckIcon size={16} className="ml-auto" />
                                    )}
                                    <span className="text-muted-foreground text-xs">
                                       {counts.get(user.id) ?? 0}
                                    </span>
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  )}
               </IssueCounts>
            </PopoverContent>
         </Popover>
      </div>
   );
}
