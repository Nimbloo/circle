'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
   CommandShortcut,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { INITIATIVE_STATUS_META, type InitiativeStatus } from '@/data/initiatives';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { useHealthStates, useLabels, usePriorities } from '@/store/catalog-store';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CheckIcon, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { InitiativeIconPicker } from './initiative-icon-picker';
import { InitiativeLabelPicker } from './initiative-label-picker';
import { InitiativeStatusIcon } from './initiative-status-icon';
import { InitiativeTargetPicker } from './initiative-target-picker';

export function buildInitiativeSlug(value: string): string {
   const base = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 83);
   const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
   return `${base || 'initiative'}-${suffix}`;
}

const STATUS_IDS = Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[];
const triggerClassName = 'gap-1.5 bg-transparent px-2 text-xs font-normal text-muted-foreground';

export function InlineNewInitiative({
   defaultStatus,
}: {
   defaultStatus: InitiativeStatus | 'all';
}) {
   const stop = useInlineInitiativeStore((state) => state.stop);
   const applyInitiative = useWorkspaceStore((state) => state.applyInitiative);
   const users = useWorkspaceStore((state) => state.users);
   const priorities = usePriorities();
   const healthStates = useHealthStates();
   const labels = useLabels();

   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [summary, setSummary] = useState('');
   const [icon, setIcon] = useState('target');
   const [iconColor, setIconColor] = useState('violet');
   const [status, setStatus] = useState<InitiativeStatus>(
      defaultStatus === 'all' ? 'active' : defaultStatus
   );
   const [priorityId, setPriorityId] = useState('');
   const [healthId, setHealthId] = useState('');
   const [ownerId, setOwnerId] = useState<string | null>(null);
   const [target, setTarget] = useState('');
   const [labelIds, setLabelIds] = useState<string[]>([]);
   const [statusOpen, setStatusOpen] = useState(false);
   const [priorityOpen, setPriorityOpen] = useState(false);
   const [ownerOpen, setOwnerOpen] = useState(false);
   const nameRef = useRef<HTMLInputElement>(null);

   useEffect(() => {
      nameRef.current?.focus();
   }, []);

   useEffect(() => {
      if (!priorityId) {
         const noPriority = priorities.find((priority) => /no priority/i.test(priority.name));
         setPriorityId(noPriority?.id ?? priorities[0]?.id ?? '');
      }
      if (!healthId) {
         const noUpdate = healthStates.find((health) => health.id === 'no-update');
         setHealthId(noUpdate?.id ?? healthStates[0]?.id ?? '');
      }
   }, [healthId, healthStates, priorities, priorityId]);

   const owner = users.find((user) => user.id === ownerId) ?? null;
   const priority = priorities.find((entry) => entry.id === priorityId);

   const create = async () => {
      if (!name.trim() || !priorityId || !healthId || busy) return;
      setBusy(true);
      try {
         const created = await api.initiatives.create({
            slug: buildInitiativeSlug(name),
            name: name.trim(),
            priorityId,
            healthId,
            status,
            description: summary.trim() || null,
            icon,
            iconColor,
            ownerId,
            target: target || null,
            labelIds,
         });
         applyInitiative(created);
         toast.success('Initiative created');
         stop();
      } catch {
         toast.error('Não foi possível criar a initiative');
      } finally {
         setBusy(false);
      }
   };

   const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.target as Node)) return;
      if (event.key === 'Escape') {
         event.preventDefault();
         stop();
         return;
      }
      if (
         event.key === 'Enter' &&
         !event.shiftKey &&
         (event.target === nameRef.current ||
            event.currentTarget.querySelector('[aria-label="Initiative summary"]') === event.target)
      ) {
         event.preventDefault();
         void create();
      }
   };

   return (
      <div
         className="mx-3 mb-3 rounded-md border border-[var(--initiative-editor-border)] bg-card px-[17px] pb-4 pt-3 shadow-[var(--initiative-editor-shadow)]"
         onKeyDown={onKeyDown}
      >
         <div className="flex h-7 items-center gap-3">
            <InitiativeIconPicker
               icon={icon}
               color={iconColor}
               onIconChange={setIcon}
               onColorChange={setIconColor}
               compact
            />
            <input
               ref={nameRef}
               value={name}
               onChange={(event) => setName(event.target.value)}
               placeholder="Initiative name"
               aria-label="Initiative name"
               maxLength={196}
               className="block h-[23px] min-w-0 flex-1 bg-transparent text-base font-medium leading-[23px] outline-none placeholder:text-muted-foreground"
            />
         </div>

         <div className="flex h-[30px] items-start pl-10">
            <input
               value={summary}
               onChange={(event) => setSummary(event.target.value)}
               placeholder="Initiative summary"
               aria-label="Initiative summary"
               className="block h-[22px] w-full bg-transparent text-[13px] leading-[22px] text-muted-foreground outline-none placeholder:text-muted-foreground/70"
            />
         </div>

         <div className="flex h-6 items-center justify-between gap-3 pl-10">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
               <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                  <PopoverTrigger asChild>
                     <Button
                        type="button"
                        size="xxs"
                        variant="outline"
                        className={triggerClassName}
                        aria-label="Change status"
                     >
                        <InitiativeStatusIcon status={status} />
                        {INITIATIVE_STATUS_META[status].label}
                     </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-52 p-0">
                     <Command
                        onKeyDown={(event) => {
                           const candidate = STATUS_IDS[Number(event.key) - 1];
                           if (!candidate || event.metaKey || event.ctrlKey || event.altKey) return;
                           event.preventDefault();
                           setStatus(candidate);
                           setStatusOpen(false);
                        }}
                     >
                        <CommandInput autoFocus placeholder="Change status…" />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           <CommandGroup>
                              {STATUS_IDS.map((candidate, index) => (
                                 <CommandItem
                                    key={candidate}
                                    onSelect={() => {
                                       setStatus(candidate);
                                       setStatusOpen(false);
                                    }}
                                 >
                                    <InitiativeStatusIcon status={candidate} />
                                    {INITIATIVE_STATUS_META[candidate].label}
                                    {status === candidate && (
                                       <CheckIcon className="ml-auto size-3.5" />
                                    )}
                                    <CommandShortcut>{index + 1}</CommandShortcut>
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
                  <PopoverTrigger asChild>
                     <Button
                        type="button"
                        size="xxs"
                        variant="outline"
                        className={triggerClassName}
                        aria-label="Change priority"
                     >
                        {priority ? (
                           <>
                              <priority.icon className="size-3.5" />
                              {priority.name}
                           </>
                        ) : (
                           'Priority'
                        )}
                     </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-52 p-0">
                     <Command
                        onKeyDown={(event) => {
                           if (
                              !/^\d$/.test(event.key) ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.altKey
                           )
                              return;
                           const candidate = priorities[Number(event.key)];
                           if (!candidate) return;
                           event.preventDefault();
                           setPriorityId(candidate.id);
                           setPriorityOpen(false);
                        }}
                     >
                        <CommandInput autoFocus placeholder="Change priority…" />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           <CommandGroup>
                              {priorities.map((candidate, index) => (
                                 <CommandItem
                                    key={candidate.id}
                                    onSelect={() => {
                                       setPriorityId(candidate.id);
                                       setPriorityOpen(false);
                                    }}
                                 >
                                    <candidate.icon className="size-4 text-muted-foreground" />
                                    {candidate.name}
                                    {priorityId === candidate.id && (
                                       <CheckIcon className="ml-auto size-3.5" />
                                    )}
                                    <CommandShortcut>{index}</CommandShortcut>
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
                  <PopoverTrigger asChild>
                     <Button
                        type="button"
                        size="xxs"
                        variant="outline"
                        className={triggerClassName}
                        aria-label="Change initiative owner"
                     >
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
                     </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-60 p-0">
                     <Command
                        onKeyDown={(event) => {
                           if (
                              !/^\d$/.test(event.key) ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.altKey
                           )
                              return;
                           event.preventDefault();
                           if (event.key === '0') setOwnerId(null);
                           else {
                              const candidate = users[Number(event.key) - 1];
                              if (!candidate) return;
                              setOwnerId(candidate.id);
                           }
                           setOwnerOpen(false);
                        }}
                     >
                        <CommandInput autoFocus placeholder="Set owner…" />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           <CommandGroup>
                              <CommandItem
                                 onSelect={() => {
                                    setOwnerId(null);
                                    setOwnerOpen(false);
                                 }}
                              >
                                 <UserRound className="size-4 text-muted-foreground" />
                                 No owner
                                 {!ownerId && <CheckIcon className="ml-auto size-3.5" />}
                                 <CommandShortcut>0</CommandShortcut>
                              </CommandItem>
                              {users.map((user, index) => (
                                 <CommandItem
                                    key={user.id}
                                    onSelect={() => {
                                       setOwnerId(user.id);
                                       setOwnerOpen(false);
                                    }}
                                 >
                                    <Avatar className="size-4">
                                       <AvatarImage
                                          src={user.avatarUrl || undefined}
                                          alt={user.name}
                                       />
                                       <AvatarFallback className="text-[8px]">
                                          {user.name[0]}
                                       </AvatarFallback>
                                    </Avatar>
                                    {user.name}
                                    {ownerId === user.id && (
                                       <CheckIcon className="ml-auto size-3.5" />
                                    )}
                                    {index < 9 && <CommandShortcut>{index + 1}</CommandShortcut>}
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               <InitiativeTargetPicker value={target} onChange={setTarget} compact />
               <InitiativeLabelPicker
                  labels={labels}
                  value={labelIds}
                  onChange={setLabelIds}
                  compact
               />
            </div>

            <div className="flex shrink-0 items-center gap-2">
               <Button
                  type="button"
                  size="xxs"
                  variant="ghost"
                  onClick={stop}
                  disabled={busy}
                  aria-label="Cancel initiative"
               >
                  Cancel
               </Button>
               <Button
                  type="button"
                  size="xxs"
                  onClick={() => void create()}
                  disabled={busy || !name.trim() || !priorityId || !healthId}
                  aria-label="Create initiative"
                  className={cn(busy && 'opacity-70')}
               >
                  Create
               </Button>
            </div>
         </div>
      </div>
   );
}
