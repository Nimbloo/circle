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
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { activeUsers, User } from '@/data/users';
import { CheckIcon, UserCircle, UserRoundCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AssigneeAvatars } from '@/components/common/issues/assignee-avatars';

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

   // Conta derivada da fatia assinada: assinar `filterByAssignee` (funcao, referencia
   // estavel) deixaria o contador do dropdown parado quando as issues mudam.
   const allIssues = useIssuesStore((s) => s.issues);
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
   const countFor = (userId: string) =>
      allIssues.filter((i) => (i.assignees ?? []).some((a) => a.id === userId)).length;

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
                              {isSelected(me.id) && <CheckIcon size={16} className="ml-auto" />}
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
                           {assignees.length === 0 && <CheckIcon size={16} className="ml-auto" />}
                           <span className="text-muted-foreground text-xs">
                              {allIssues.filter((i) => i.assignee === null).length}
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
                              {isSelected(user.id) && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">
                                 {countFor(user.id)}
                              </span>
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}
