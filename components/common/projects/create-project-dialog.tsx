'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Option {
   id: string;
   name: string;
}

/**
 * Cria um projeto via api.projects.create e re-hidrata o workspace.
 * Campos obrigatórios da rota: name, teamId, statusId, priorityId, healthId.
 */
export function CreateProjectButton() {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const teams = useWorkspaceStore((s) => s.teams);
   const initiatives = useWorkspaceStore((s) => s.initiatives);

   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [teamId, setTeamId] = useState('');
   const [statusId, setStatusId] = useState('');
   const [priorityId, setPriorityId] = useState('');
   const [healthId, setHealthId] = useState('');
   const [initiativeId, setInitiativeId] = useState('none');

   const [statuses, setStatuses] = useState<Option[]>([]);
   const [priorities, setPriorities] = useState<Option[]>([]);
   const [healths, setHealths] = useState<Option[]>([]);

   // Carrega os catálogos (status/priority/health) só ao abrir o diálogo.
   useEffect(() => {
      if (!open) return;
      let alive = true;
      void (async () => {
         try {
            const [st, pr, he] = await Promise.all([
               api.statuses(),
               api.priorities(),
               api.healthStates(),
            ]);
            if (!alive) return;
            setStatuses(st);
            setPriorities(pr);
            setHealths(he);
            setStatusId((v) => v || st[0]?.id || '');
            setPriorityId((v) => v || pr[0]?.id || '');
            setHealthId((v) => v || he[0]?.id || '');
         } catch {
            toast.error('Could not load project catalogs');
         }
      })();
      return () => {
         alive = false;
      };
   }, [open]);

   useEffect(() => {
      if (open && !teamId) setTeamId(teams[0]?.id ?? '');
   }, [open, teams, teamId]);

   const create = async () => {
      if (!name.trim() || !teamId || !statusId || !priorityId || !healthId || busy) return;
      setBusy(true);
      try {
         await api.projects.create({
            name: name.trim(),
            teamId,
            statusId,
            priorityId,
            healthId,
            initiativeId: initiativeId === 'none' ? null : initiativeId,
         });
         await hydrate();
         setName('');
         setInitiativeId('none');
         setOpen(false);
         toast.success('Project created');
      } catch {
         toast.error('Could not create the project');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
            <Button className="relative" size="xs" variant="secondary">
               <Plus className="size-4" />
               <span className="hidden sm:inline ml-1">Create project</span>
            </Button>
         </DialogTrigger>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Create project</DialogTitle>
               <DialogDescription>Novo projeto no workspace.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                     id="project-name"
                     placeholder="Project name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     maxLength={196}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label>Team</Label>
                  <Select value={teamId} onValueChange={setTeamId}>
                     <SelectTrigger>
                        <SelectValue placeholder="Select team" />
                     </SelectTrigger>
                     <SelectContent>
                        {teams.map((t) => (
                           <SelectItem key={t.id} value={t.id}>
                              {t.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
               <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label>Status</Label>
                     <Select value={statusId} onValueChange={setStatusId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                           {statuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                 {s.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label>Priority</Label>
                     <Select value={priorityId} onValueChange={setPriorityId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                           {priorities.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                 {p.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label>Health</Label>
                     <Select value={healthId} onValueChange={setHealthId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Health" />
                        </SelectTrigger>
                        <SelectContent>
                           {healths.map((h) => (
                              <SelectItem key={h.id} value={h.id}>
                                 {h.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label>Initiative</Label>
                  <Select value={initiativeId} onValueChange={setInitiativeId}>
                     <SelectTrigger>
                        <SelectValue placeholder="No initiative" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="none">No initiative</SelectItem>
                        {initiatives.map((i) => (
                           <SelectItem key={i.id} value={i.id}>
                              {i.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
            </div>
            <DialogFooter>
               <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={
                     busy || !name.trim() || !teamId || !statusId || !priorityId || !healthId
                  }
               >
                  Create project
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
