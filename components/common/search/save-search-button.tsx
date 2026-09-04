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
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { SearchFilters } from './search-chips';

function slugify(v: string): string {
   return v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/**
 * "Save search": transforma a busca corrente (termo + chips) numa saved view de
 * issues. A view guarda o `q` no filtro e, ao abrir, lista pelo MESMO endpoint de
 * busca — o resultado salvo é o mesmo que está na tela.
 */
export function SaveSearchButton({ query, filters }: { query: string; filters: SearchFilters }) {
   const applyView = useWorkspaceStore((s) => s.applyView);
   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');

   const effectiveName = name.trim() || query.trim();

   const save = async () => {
      if (!effectiveName || busy) return;
      setBusy(true);
      try {
         const dto = await api.views.create({
            slug: `${slugify(effectiveName) || 'search'}-${Date.now().toString(36)}`,
            name: effectiveName,
            type: 'issue',
            filter: {
               q: query.trim(),
               statusIds: filters.statusId ? [filters.statusId] : undefined,
            },
            teamId: filters.teamId ?? null,
         });
         applyView(dto);
         setName('');
         setOpen(false);
         // Toast só depois da confirmação da API.
         toast.success('Search saved as a view');
      } catch {
         toast.error('Could not save the search');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
            <Button
               size="xs"
               variant="ghost"
               aria-label="Save search"
               className="px-[9px] text-xs has-[>svg]:px-[9px]"
               disabled={!query.trim()}
            >
               <BookmarkPlus className="size-4" />
               Save search
            </Button>
         </DialogTrigger>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Save search</DialogTitle>
               <DialogDescription>
                  Cria uma view de issues com este termo e os filtros aplicados.
               </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
               <Label htmlFor="save-search-name">Name</Label>
               <Input
                  id="save-search-name"
                  value={name}
                  placeholder={query.trim()}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void save()}
               />
            </div>
            <DialogFooter>
               <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button size="sm" onClick={() => void save()} disabled={!effectiveName || busy}>
                  {busy ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
