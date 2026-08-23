'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { INITIATIVE_STATUS_META, InitiativeStatus } from '@/data/initiatives';
import { health as allHealth } from '@/data/projects';
import { usePriorities } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';
import { CalendarClock, CheckIcon, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { InitiativeStatusIcon } from './initiative-status-icon';

function slugify(v: string): string {
   return v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/** Chip clicável (mesma linguagem visual dos chips do New Issue). */
function Chip({ children }: { children: React.ReactNode }) {
   return (
      <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs text-muted-foreground hover:bg-accent/50 transition-colors cursor-pointer">
         {children}
      </span>
   );
}

const STATUS_IDS = Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[];

/**
 * Criação INLINE de initiative (padrão Linear): linha editável no topo da lista,
 * com nome + resumo + chips de propriedade (status/priority/owner/target date) e
 * ações Cancel/Create — sem modal.
 */
export function InlineNewInitiative({ defaultStatus }: { defaultStatus: InitiativeStatus }) {
   const stop = useInlineInitiativeStore((s) => s.stop);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const users = useWorkspaceStore((s) => s.users);
   const priorities = usePriorities();

   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [summary, setSummary] = useState('');
   const [status, setStatus] = useState<InitiativeStatus>(
      defaultStatus === ('all' as InitiativeStatus) ? 'active' : defaultStatus
   );
   const [priorityId, setPriorityId] = useState('');
   const [healthId, setHealthId] = useState('');
   const [ownerId, setOwnerId] = useState<string | null>(null);
   const [target, setTarget] = useState('');
   const nameRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      nameRef.current?.focus();
      void (async () => {
         try {
            const [pr, he] = await Promise.all([api.priorities(), api.healthStates()]);
            setPriorityId((v) => v || pr[0]?.id || '');
            setHealthId(he[0]?.id || '');
         } catch {
            /* catálogos opcionais */
         }
      })();
   }, []);

   const owner = users.find((u) => u.id === ownerId) ?? null;
   const priority = priorities.find((p) => p.id === priorityId);

   const create = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         await api.initiatives.create({
            slug: slugify(name),
            name: name.trim(),
            priorityId: priorityId || priorities[0]?.id || '',
            healthId: healthId || allHealth[0]?.id || '',
            status,
            description: summary.trim() || null,
            ownerId,
            target: target || null,
         });
         await hydrate();
         toast.success('Initiative created');
         stop();
      } catch {
         toast.error('Não foi possível criar a initiative (slug já existe?)');
         setBusy(false);
      }
   };

   const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
         e.preventDefault();
         void create();
      } else if (e.key === 'Escape') {
         stop();
      }
   };

   return (
      <div className="px-6 py-3 border-b bg-accent/20" onKeyDown={onKeyDown}>
         <div className="flex items-start gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded bg-muted/50 text-sm shrink-0 mt-0.5">
               <InitiativeStatusIcon status={status} />
            </span>
            <div className="flex-1 min-w-0">
               <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="New initiative"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
               />
               <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Add a short summary…"
                  className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/70 mt-0.5"
               />
            </div>
         </div>

         <div className="flex items-center justify-between mt-2.5 pl-8">
            <div className="flex items-center gap-1.5 flex-wrap">
               {/* Status */}
               <Popover>
                  <PopoverTrigger asChild>
                     <Chip>
                        <InitiativeStatusIcon status={status} />
                        {INITIATIVE_STATUS_META[status].label}
                     </Chip>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 p-0">
                     <Command>
                        <CommandList>
                           <CommandGroup>
                              {STATUS_IDS.map((s) => (
                                 <CommandItem key={s} onSelect={() => setStatus(s)}>
                                    <InitiativeStatusIcon status={s} />
                                    {INITIATIVE_STATUS_META[s].label}
                                    {status === s && <CheckIcon className="ml-auto size-3.5" />}
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               {/* Priority */}
               <Popover>
                  <PopoverTrigger asChild>
                     <Chip>
                        {priority ? (
                           <>
                              <priority.icon className="size-3.5" />
                              {priority.name}
                           </>
                        ) : (
                           'Priority'
                        )}
                     </Chip>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-52 p-0">
                     <Command>
                        <CommandInput placeholder="Priority…" />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           <CommandGroup>
                              {priorities.map((p) => (
                                 <CommandItem key={p.id} onSelect={() => setPriorityId(p.id)}>
                                    <p.icon className="size-4 text-muted-foreground" />
                                    {p.name}
                                    {priorityId === p.id && (
                                       <CheckIcon className="ml-auto size-3.5" />
                                    )}
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               {/* Owner */}
               <Popover>
                  <PopoverTrigger asChild>
                     <Chip>
                        {owner ? (
                           <>
                              <Avatar className="size-4">
                                 <AvatarImage src={owner.avatarUrl || undefined} alt={owner.name} />
                                 <AvatarFallback className="text-[8px]">
                                    {owner.name[0]}
                                 </AvatarFallback>
                              </Avatar>
                              {owner.name}
                           </>
                        ) : (
                           <>
                              <UserRound className="size-3.5" />
                              Owner
                           </>
                        )}
                     </Chip>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-0">
                     <Command>
                        <CommandInput placeholder="Owner…" />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           <CommandGroup>
                              <CommandItem onSelect={() => setOwnerId(null)}>
                                 <UserRound className="size-4 text-muted-foreground" />
                                 No owner
                                 {!ownerId && <CheckIcon className="ml-auto size-3.5" />}
                              </CommandItem>
                              {users.map((u) => (
                                 <CommandItem key={u.id} onSelect={() => setOwnerId(u.id)}>
                                    <Avatar className="size-4">
                                       <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                                       <AvatarFallback className="text-[8px]">
                                          {u.name[0]}
                                       </AvatarFallback>
                                    </Avatar>
                                    {u.name}
                                    {ownerId === u.id && <CheckIcon className="ml-auto size-3.5" />}
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               {/* Target date */}
               <Popover>
                  <PopoverTrigger asChild>
                     <Chip>
                        <CalendarClock className="size-3.5" />
                        {target || 'Target date'}
                     </Chip>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-2">
                     <input
                        type="date"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        className="bg-transparent text-sm outline-none"
                     />
                  </PopoverContent>
               </Popover>
            </div>

            <div className="flex items-center gap-2 shrink-0">
               <Button size="xs" variant="ghost" onClick={stop} disabled={busy}>
                  Cancel
               </Button>
               <Button
                  size="xs"
                  onClick={() => void create()}
                  disabled={busy || !name.trim()}
                  className={cn(busy && 'opacity-70')}
               >
                  Create
               </Button>
            </div>
         </div>
      </div>
   );
}
