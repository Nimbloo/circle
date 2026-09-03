'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export function AddTeamMemberButton() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((state) => state.teams);
   const workspaceUsers = useWorkspaceStore((state) => state.users);
   const applyTeamMembers = useWorkspaceStore((state) => state.applyTeamMembers);
   const isAdmin = useWorkspaceStore((state) => state.me?.admin ?? false);
   const team = teams.find((candidate) => candidate.id === teamId);

   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [query, setQuery] = useState('');

   if (!team || !isAdmin) return null;

   const nonMembers = workspaceUsers
      .filter((user) => !team.members.some((member) => member.id === user.id))
      .filter((user) => {
         const normalizedQuery = query.trim().toLowerCase();
         return (
            !normalizedQuery ||
            user.name.toLowerCase().includes(normalizedQuery) ||
            user.email.toLowerCase().includes(normalizedQuery)
         );
      })
      .slice(0, 8);

   const addMember = async (memberEmail: string) => {
      const email = memberEmail.trim().toLowerCase();
      if (!email || busy) return;

      setBusy(true);
      try {
         applyTeamMembers(team.id, await api.teams.addMember(team.id, email));
         setQuery('');
         setOpen(false);
         toast.success(`${email} added to ${team.name}`);
      } catch {
         toast.error('Could not add the member');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               size="xs"
               variant="ghost"
               aria-label="Add a member"
               className="px-[9px] text-xs has-[>svg]:px-[9px]"
            >
               <Plus className="size-4" />
               Add a member
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b p-2">
               <Input
                  autoFocus
                  placeholder="Search workspace members…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8"
               />
            </div>
            <div className="max-h-56 overflow-auto py-1">
               {nonMembers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                     {query
                        ? 'No members found.'
                        : 'Every workspace member already belongs to this team.'}
                  </p>
               ) : (
                  nonMembers.map((user) => (
                     <button
                        key={user.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void addMember(user.email)}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                     >
                        <Avatar className="size-6 shrink-0">
                           <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                           <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="flex min-w-0 flex-col">
                           <span className="truncate font-medium">{user.name}</span>
                           <span className="truncate text-xs text-muted-foreground">
                              {user.email}
                           </span>
                        </span>
                     </button>
                  ))
               )}
            </div>
            <p className="border-t p-2 text-[11px] text-muted-foreground">
               Only people who already have Circle access appear here. Grant access in Orbis first;
               they will become available after their first SSO login.
            </p>
         </PopoverContent>
      </Popover>
   );
}
