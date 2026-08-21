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

/**
 * Cria um cycle via api.cycles.create e re-hidrata o workspace.
 * Campos obrigatórios da rota: name, startDate, endDate (team vem da rota/seleção).
 */
export function CreateCycleButton({ defaultTeamId }: { defaultTeamId?: string }) {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const teams = useWorkspaceStore((s) => s.teams);

   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [teamId, setTeamId] = useState(defaultTeamId ?? '');
   const [startDate, setStartDate] = useState('');
   const [endDate, setEndDate] = useState('');

   useEffect(() => {
      if (open && !teamId) setTeamId(defaultTeamId ?? teams[0]?.id ?? '');
   }, [open, teamId, defaultTeamId, teams]);

   const create = async () => {
      if (!name.trim() || !teamId || !startDate || !endDate || busy) return;
      if (startDate > endDate) {
         toast.error('Start date must be before end date');
         return;
      }
      setBusy(true);
      try {
         await api.cycles.create(teamId, { teamId, name: name.trim(), startDate, endDate });
         await hydrate();
         setName('');
         setStartDate('');
         setEndDate('');
         setOpen(false);
         toast.success('Cycle created');
      } catch {
         toast.error('Could not create the cycle');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
            <Button size="xs" variant="secondary">
               <Plus className="size-4" />
               <span className="hidden sm:inline ml-1">New cycle</span>
            </Button>
         </DialogTrigger>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New cycle</DialogTitle>
               <DialogDescription>Time-boxed iteration for a team.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cycle-name">Name</Label>
                  <Input
                     id="cycle-name"
                     placeholder="Cycle name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
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
               <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="cycle-start">Start date</Label>
                     <Input
                        id="cycle-start"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                     />
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="cycle-end">End date</Label>
                     <Input
                        id="cycle-end"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                     />
                  </div>
               </div>
            </div>
            <DialogFooter>
               <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={busy || !name.trim() || !teamId || !startDate || !endDate}
               >
                  Create cycle
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
