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
import { usePriorities, useStatuses } from '@/store/catalog-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { BarChart3, CircleDot, Trash2, User as UserIcon, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Barra de ações em lote (Linear-style): aparece quando há issues selecionadas
 * e aplica status/prioridade/assignee/delete sobre a seleção via issues-store.
 */
export function BulkActionsBar() {
   const selected = useBulkSelectionStore((s) => s.selected);
   const clear = useBulkSelectionStore((s) => s.clear);
   const users = useWorkspaceStore((s) => s.users);
   const allStatus = useStatuses();
   const priorities = usePriorities();
   const { updateIssueStatus, updateIssuePriority, updateIssueAssignee, deleteIssue } =
      useIssuesStore();

   const ids = [...selected];
   if (ids.length === 0) return null;

   const applyStatus = (statusId: string) => {
      const s = allStatus.find((x) => x.id === statusId);
      if (!s) return;
      ids.forEach((id) => updateIssueStatus(id, s));
      toast.success(`${ids.length} issues → ${s.name}`);
   };

   const applyPriority = (priorityId: string) => {
      const p = priorities.find((x) => x.id === priorityId);
      if (!p) return;
      ids.forEach((id) => updateIssuePriority(id, p));
      toast.success(`${ids.length} issues → ${p.name}`);
   };

   const applyAssignee = (userId: string | null) => {
      const u = userId ? (users.find((x) => x.id === userId) ?? null) : null;
      ids.forEach((id) => updateIssueAssignee(id, u));
      toast.success(
         u ? `Assigned ${ids.length} issues to ${u.name}` : `Unassigned ${ids.length} issues`
      );
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
                                    <AvatarImage src={u.avatarUrl} alt={u.name} />
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
