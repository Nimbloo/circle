'use client';

import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { User, activeUsers } from '@/data/users';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CheckIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useId, useState } from 'react';

interface LeadSelectorProps {
   lead: User | null;
   onLeadChange?: (userId: string) => void;
}

export function LeadSelector({ lead, onLeadChange }: LeadSelectorProps) {
   const id = useId();
   // Membros desativados (#100) não podem virar lead.
   const users = activeUsers(useWorkspaceStore((s) => s.users));
   const [open, setOpen] = useState<boolean>(false);
   // Deriva do prop — reverte junto com o rollback e reflete mudança externa.
   const value = lead?.id ?? '';

   const handleLeadChange = (userId: string) => {
      setOpen(false);

      if (onLeadChange) {
         onLeadChange(userId);
      }
   };

   return (
      <div>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center gap-1 h-7 px-2"
                  size="sm"
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
                  aria-label="Set lead"
               >
                  {(() => {
                     const selectedUser = users.find((user) => user.id === value);
                     if (selectedUser) {
                        return (
                           <>
                              <Avatar className="size-5 mr-1">
                                 <AvatarImage
                                    src={selectedUser.avatarUrl || undefined}
                                    alt={selectedUser.name}
                                 />
                                 <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs hidden md:inline">{selectedUser.name}</span>
                           </>
                        );
                     }
                     return null;
                  })()}
               </Button>
            </PopoverTrigger>
            <PopoverContent className="border-input w-48 p-0" align="start">
               <Command>
                  <CommandInput placeholder="Set lead..." />
                  <CommandList>
                     <CommandEmpty>No user found.</CommandEmpty>
                     <CommandGroup>
                        {users.map((user) => (
                           <CommandItem
                              key={user.id}
                              value={user.id}
                              keywords={[user.name]}
                              onSelect={handleLeadChange}
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
                                 <span className="text-xs">{user.name}</span>
                              </div>
                              {value === user.id && <CheckIcon size={14} className="ml-auto" />}
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
