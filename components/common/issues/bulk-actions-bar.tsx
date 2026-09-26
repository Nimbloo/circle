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
import { principalAssigneePatch, useIssuesStore } from '@/store/issues-store';
import { activeUsers } from '@/data/users';
import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { BarChart3, CircleDot, Trash2, User as UserIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { deleteIssuesWithUndo } from './delete-with-undo';
import { BULK_UPDATE_MAX } from '@/lib/issue-bulk';

/**
 * Barra de ações em lote (Linear-style): aparece quando há issues selecionadas
 * e aplica status/prioridade/assignee/delete sobre a seleção via issues-store.
 */
export function BulkActionsBar() {
   const selected = useBulkSelectionStore((s) => s.selected);
   const clear = useBulkSelectionStore((s) => s.clear);
   const allUsers = useWorkspaceStore((s) => s.users);
   const users = useMemo(() => activeUsers(allUsers), [allUsers]);
   const allStatus = useStatuses();
   const priorities = usePriorities();
   const bulkUpdate = useIssuesStore((s) => s.bulkUpdate);
   // Popover aberto (controlado): escolher uma opção fecha o seletor.
   const [open, setOpen] = useState<'status' | 'priority' | 'assignee' | null>(null);
   const openProps = (key: 'status' | 'priority' | 'assignee') => ({
      open: open === key,
      onOpenChange: (next: boolean) => setOpen(next ? key : null),
   });

   const ids = [...selected];
   if (ids.length === 0) return null;

   // Lote atômico (#30): uma requisição, tudo ou nada. Sucesso só quando o servidor
   // confirma; a falha já é avisada (e desfeita em todas) pelo store.
   const withToast = (run: () => Promise<void>, msg: string) => {
      setOpen(null);
      // Acima do teto a API recusaria o lote inteiro: avisa antes, sem mexer em nada.
      if (ids.length > BULK_UPDATE_MAX) {
         toast.error(
            `Edição em lote aceita até ${BULK_UPDATE_MAX} issues por vez (${ids.length} selecionadas)`
         );
         return;
      }
      run().then(
         () => toast.success(msg),
         () => {}
      );
   };

   const applyStatus = (statusId: string) => {
      const s = allStatus.find((x) => x.id === statusId);
      if (!s) return;
      withToast(() => bulkUpdate(ids, () => ({ status: s })), `${ids.length} issues → ${s.name}`);
   };

   const applyPriority = (priorityId: string) => {
      const p = priorities.find((x) => x.id === priorityId);
      if (!p) return;
      withToast(() => bulkUpdate(ids, () => ({ priority: p })), `${ids.length} issues → ${p.name}`);
   };

   const applyAssignee = (userId: string | null) => {
      const u = userId ? (users.find((x) => x.id === userId) ?? null) : null;
      withToast(
         () => bulkUpdate(ids, (issue) => principalAssigneePatch(issue, u)),
         u ? `Assigned ${ids.length} issues to ${u.name}` : `Unassigned ${ids.length} issues`
      );
   };

   // Mesma exclusão do ⌘⌫ (is#16): somem da lista na hora, toast com Undo e o DELETE só
   // quando o toast fecha. Antes o lote pela barra excluía direto, sem Undo.
   const remove = () => {
      setOpen(null);
      deleteIssuesWithUndo(ids);
      clear();
   };

   return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
         <div className="motion-rise pointer-events-auto flex items-center gap-1 rounded-lg border bg-container shadow-lg px-2 py-1.5">
            <span className="px-2 text-sm font-medium tabular-nums">{ids.length} selected</span>
            <span className="w-px h-5 bg-border mx-1" />

            <Popover {...openProps('status')}>
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

            <Popover {...openProps('priority')}>
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

            <Popover {...openProps('assignee')}>
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
                        As issues selecionadas saem da lista na hora. Dá para desfazer pelo toast
                        por alguns segundos.
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
