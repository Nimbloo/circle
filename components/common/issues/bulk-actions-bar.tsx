'use client';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { usePriorities, useStatuses, useLabels } from '@/store/catalog-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssuesStore } from '@/store/issues-store';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore } from '@/store/workspace-store';
import { BarChart3, Box, CircleDot, Tag, Trash2, User as UserIcon, X } from 'lucide-react';
import { ComponentType } from 'react';
import { toast } from 'sonner';

type IconCmp = ComponentType<{ className?: string }>;

/**
 * Barra de ações em lote (Linear-style): aparece quando há issues selecionadas e
 * aplica status/prioridade/assignee/project/cycle/label + delete sobre a seleção.
 * As mudanças de campo vão num ÚNICO request batch (não N PATCHes) via `bulkUpdate`.
 */
export function BulkActionsBar() {
   const selected = useBulkSelectionStore((s) => s.selected);
   const clear = useBulkSelectionStore((s) => s.clear);
   const users = useWorkspaceStore((s) => s.users);
   const projects = useWorkspaceStore((s) => s.projects);
   const cycles = useWorkspaceStore((s) => s.cycles);
   const allStatus = useStatuses();
   const priorities = usePriorities();
   const labels = useLabels();
   const { bulkUpdate, bulkAddLabel, deleteIssue } = useIssuesStore(
      useShallow((s) => ({
         bulkUpdate: s.bulkUpdate,
         bulkAddLabel: s.bulkAddLabel,
         deleteIssue: s.deleteIssue,
      }))
   );

   const ids = [...selected];
   if (ids.length === 0) return null;

   const applyStatus = (statusId: string) => {
      const s = allStatus.find((x) => x.id === statusId);
      if (!s) return;
      bulkUpdate(ids, { status: s });
      toast.success(`${ids.length} issues → ${s.name}`);
   };

   const applyPriority = (priorityId: string) => {
      const p = priorities.find((x) => x.id === priorityId);
      if (!p) return;
      bulkUpdate(ids, { priority: p });
      toast.success(`${ids.length} issues → ${p.name}`);
   };

   const applyAssignee = (userId: string | null) => {
      const u = userId ? (users.find((x) => x.id === userId) ?? null) : null;
      bulkUpdate(ids, { assignee: u });
      toast.success(
         u ? `Assigned ${ids.length} issues to ${u.name}` : `Unassigned ${ids.length} issues`
      );
   };

   const applyProject = (projectId: string | null) => {
      const p = projectId ? projects.find((x) => x.id === projectId) : undefined;
      bulkUpdate(ids, { project: p });
      toast.success(p ? `${ids.length} issues → ${p.name}` : `Removed ${ids.length} from project`);
   };

   const applyCycle = (cycleId: string) => {
      const c = cycleId ? cycles.find((x) => x.id === cycleId) : undefined;
      bulkUpdate(ids, { cycleId });
      toast.success(c ? `${ids.length} issues → ${c.name}` : `Removed ${ids.length} from cycle`);
   };

   const applyLabel = (labelId: string) => {
      const l = labels.find((x) => x.id === labelId);
      if (!l) return;
      bulkAddLabel(ids, l);
      toast.success(`Added "${l.name}" to ${ids.length} issues`);
   };

   const remove = () => {
      const n = ids.length;
      ids.forEach((id) => deleteIssue(id));
      clear();
      toast.success(`Deleted ${n} ${n === 1 ? 'issue' : 'issues'}`);
   };

   return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
         <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-container shadow-lg px-2 py-1.5">
            <span className="px-2 text-sm font-medium tabular-nums">{ids.length} selected</span>
            <span className="w-px h-5 bg-border mx-1" />

            <Popover>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <CircleDot className="size-4" /> Status
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="center" className="w-56 p-0">
                  <Command>
                     <CommandInput placeholder="Set status..." />
                     <CommandList>
                        <CommandEmpty>No status found.</CommandEmpty>
                        <CommandGroup>
                           {allStatus.map((s) => (
                              <CommandItem
                                 key={s.id}
                                 value={s.name}
                                 onSelect={() => applyStatus(s.id)}
                              >
                                 <s.icon />
                                 {s.name}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>

            <Popover>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <BarChart3 className="size-4" /> Priority
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="center" className="w-56 p-0">
                  <Command>
                     <CommandInput placeholder="Set priority..." />
                     <CommandList>
                        <CommandEmpty>No priority found.</CommandEmpty>
                        <CommandGroup>
                           {priorities.map((p) => (
                              <CommandItem
                                 key={p.id}
                                 value={p.name}
                                 onSelect={() => applyPriority(p.id)}
                              >
                                 <p.icon className="text-muted-foreground size-4" />
                                 {p.name}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>

            <Popover>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <UserIcon className="size-4" /> Assignee
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="center" className="w-56 p-0">
                  <Command>
                     <CommandInput placeholder="Assign to..." />
                     <CommandList>
                        <CommandEmpty>No members found.</CommandEmpty>
                        <CommandGroup>
                           <CommandItem value="unassigned" onSelect={() => applyAssignee(null)}>
                              <UserIcon className="size-4 text-muted-foreground" />
                              Unassigned
                           </CommandItem>
                           {users.map((u) => (
                              <CommandItem
                                 key={u.id}
                                 value={u.name}
                                 onSelect={() => applyAssignee(u.id)}
                              >
                                 <Avatar className="size-4">
                                    <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                                    <AvatarFallback>{u.name[0]}</AvatarFallback>
                                 </Avatar>
                                 {u.name}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>

            <Popover>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <Box className="size-4" /> Project
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="center" className="w-56 p-0">
                  <Command>
                     <CommandInput placeholder="Set project..." />
                     <CommandList>
                        <CommandEmpty>No projects found.</CommandEmpty>
                        <CommandGroup>
                           <CommandItem value="no-project" onSelect={() => applyProject(null)}>
                              <Box className="size-4 text-muted-foreground" />
                              No project
                           </CommandItem>
                           {projects.map((p) => {
                              const Icon = p.icon as IconCmp;
                              return (
                                 <CommandItem
                                    key={p.id}
                                    value={`${p.name} ${p.id}`}
                                    onSelect={() => applyProject(p.id)}
                                 >
                                    <Icon className="size-4 text-muted-foreground" />
                                    <span className="truncate">{p.name}</span>
                                 </CommandItem>
                              );
                           })}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>

            <Popover>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <CyclePlayIcon className="size-4" /> Cycle
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="center" className="w-56 p-0">
                  <Command>
                     <CommandInput placeholder="Set cycle..." />
                     <CommandList>
                        <CommandEmpty>No cycles found.</CommandEmpty>
                        <CommandGroup>
                           <CommandItem value="no-cycle" onSelect={() => applyCycle('')}>
                              <CyclePlayIcon className="size-4" />
                              No cycle
                           </CommandItem>
                           {cycles.map((c) => (
                              <CommandItem
                                 key={c.id}
                                 value={`${c.name} ${c.id}`}
                                 onSelect={() => applyCycle(c.id)}
                              >
                                 <CyclePlayIcon className="size-4" />
                                 <span className="truncate">{c.name}</span>
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>

            <Popover>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <Tag className="size-4" /> Label
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="center" className="w-56 p-0">
                  <Command>
                     <CommandInput placeholder="Add label..." />
                     <CommandList>
                        <CommandEmpty>No labels found.</CommandEmpty>
                        <CommandGroup>
                           {labels.map((l) => (
                              <CommandItem
                                 key={l.id}
                                 value={l.name}
                                 onSelect={() => applyLabel(l.id)}
                              >
                                 <span
                                    className="size-2.5 rounded-full"
                                    style={{ backgroundColor: l.color }}
                                 />
                                 {l.name}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>

            <AlertDialog>
               <AlertDialogTrigger asChild>
                  <Button size="xs" variant="ghost">
                     <Trash2 className="size-4 text-red-500" /> Delete
                  </Button>
               </AlertDialogTrigger>
               <AlertDialogContent>
                  <AlertDialogHeader>
                     <AlertDialogTitle>
                        Delete {ids.length} {ids.length === 1 ? 'issue' : 'issues'}?
                     </AlertDialogTitle>
                     <AlertDialogDescription>
                        Esta ação não pode ser desfeita. As issues selecionadas serão removidas
                        permanentemente.
                     </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                     <AlertDialogCancel>Cancel</AlertDialogCancel>
                     <AlertDialogAction
                        className={buttonVariants({ variant: 'destructive' })}
                        onClick={remove}
                     >
                        Delete
                     </AlertDialogAction>
                  </AlertDialogFooter>
               </AlertDialogContent>
            </AlertDialog>
            <span className="w-px h-5 bg-border mx-1" />
            <Button size="xs" variant="ghost" onClick={clear} aria-label="Clear selection">
               <X className="size-4" />
            </Button>
         </div>
      </div>
   );
}
