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
import type { ViewFilter } from '@/lib/api/views';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ViewFilterEditor } from './view-filter-editor';

function slugify(v: string): string {
   return v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/**
 * Cria uma saved view via api.views.create e re-hidrata o workspace.
 * Campos obrigatórios da rota: slug, name, type, filter (começa vazio).
 */
export function CreateViewButton({ teamId }: { teamId?: string } = {}) {
   const hydrate = useWorkspaceStore((s) => s.hydrate);

   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [slug, setSlug] = useState('');
   const [type, setType] = useState<'issue' | 'project'>('issue');
   const [filter, setFilter] = useState<ViewFilter>({});

   const effectiveSlug = slug.trim() || slugify(name);

   const create = async () => {
      if (!name.trim() || !effectiveSlug || busy) return;
      setBusy(true);
      try {
         await api.views.create({
            slug: effectiveSlug,
            name: name.trim(),
            type,
            filter,
            // View criada no contexto de um time fica team-scoped (senão nascia
            // workspace-level e sumia da lista filtrada por time).
            teamId: teamId ?? null,
         });
         await hydrate();
         setName('');
         setSlug('');
         setFilter({});
         setOpen(false);
         toast.success('View created');
      } catch {
         toast.error('Could not create the view (slug já existe?)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
            <Button size="xs" variant="ghost" aria-label="New view">
               <Plus className="size-4" />
            </Button>
         </DialogTrigger>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New view</DialogTitle>
               <DialogDescription>Filtro salvo de issues ou projects.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="view-name">Name</Label>
                  <Input
                     id="view-name"
                     placeholder="View name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="view-slug">Slug</Label>
                  <Input
                     id="view-slug"
                     placeholder={slugify(name) || 'slug'}
                     value={slug}
                     onChange={(e) => setSlug(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as 'issue' | 'project')}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="issue">Issues</SelectItem>
                        <SelectItem value="project">Projects</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label>Filters</Label>
                  <ViewFilterEditor type={type} filter={filter} onChange={setFilter} />
                  <p className="text-xs text-muted-foreground">
                     Sem filtros, a view mostra todos os {type === 'issue' ? 'issues' : 'projects'}.
                  </p>
               </div>
            </div>
            <DialogFooter>
               <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={busy || !name.trim() || !effectiveSlug}
               >
                  Create view
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
