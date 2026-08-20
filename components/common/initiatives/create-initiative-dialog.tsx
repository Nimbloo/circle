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

function slugify(v: string): string {
   return v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/**
 * Cria uma initiative via api.initiatives.create e re-hidrata o workspace.
 * Campos obrigatórios da rota: slug, name, priorityId, healthId.
 */
export function CreateInitiativeButton() {
   const hydrate = useWorkspaceStore((s) => s.hydrate);

   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [slug, setSlug] = useState('');
   const [priorityId, setPriorityId] = useState('');
   const [healthId, setHealthId] = useState('');

   const [priorities, setPriorities] = useState<Option[]>([]);
   const [healths, setHealths] = useState<Option[]>([]);

   useEffect(() => {
      if (!open) return;
      let alive = true;
      void (async () => {
         try {
            const [pr, he] = await Promise.all([api.priorities(), api.healthStates()]);
            if (!alive) return;
            setPriorities(pr);
            setHealths(he);
            setPriorityId((v) => v || pr[0]?.id || '');
            setHealthId((v) => v || he[0]?.id || '');
         } catch {
            toast.error('Could not load initiative catalogs');
         }
      })();
      return () => {
         alive = false;
      };
   }, [open]);

   const effectiveSlug = slug.trim() || slugify(name);

   const create = async () => {
      if (!name.trim() || !effectiveSlug || !priorityId || !healthId || busy) return;
      setBusy(true);
      try {
         await api.initiatives.create({
            slug: effectiveSlug,
            name: name.trim(),
            priorityId,
            healthId,
         });
         await hydrate();
         setName('');
         setSlug('');
         setOpen(false);
         toast.success('Initiative created');
      } catch {
         toast.error('Could not create the initiative (slug já existe?)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
            <Button size="xs" variant="ghost" aria-label="New initiative">
               <Plus className="size-4" />
            </Button>
         </DialogTrigger>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New initiative</DialogTitle>
               <DialogDescription>Agrupa projetos sob um objetivo.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="initiative-name">Name</Label>
                  <Input
                     id="initiative-name"
                     placeholder="Initiative name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="initiative-slug">Slug</Label>
                  <Input
                     id="initiative-slug"
                     placeholder={slugify(name) || 'slug'}
                     value={slug}
                     onChange={(e) => setSlug(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-2 gap-2">
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
            </div>
            <DialogFooter>
               <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={busy || !name.trim() || !effectiveSlug || !priorityId || !healthId}
               >
                  Create initiative
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
