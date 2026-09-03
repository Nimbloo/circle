'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/** Cria um time (key + nome) via api.teams.create e aplica o DTO no workspace. */
export function NewTeamButton() {
   const applyTeam = useWorkspaceStore((s) => s.applyTeam);
   const [open, setOpen] = useState(false);
   const [key, setKey] = useState('');
   const [name, setName] = useState('');
   const [busy, setBusy] = useState(false);

   const create = async () => {
      const id = key.trim().toUpperCase();
      if (!id || !name.trim() || busy) return;
      setBusy(true);
      try {
         applyTeam(await api.teams.create({ id, name: name.trim() }));
         setKey('');
         setName('');
         setOpen(false);
         toast.success(`Team ${id} created`);
      } catch {
         toast.error('Could not create the team (key inválida ou já existe)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="px-[9px] text-xs has-[>svg]:px-[9px]">
               <Plus className="size-4" />
               New team
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-72 p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
               Key vira o prefixo das issues (ex.: CORE-1).
            </p>
            <Input
               placeholder="Key (ex.: CORE)"
               value={key}
               onChange={(e) => setKey(e.target.value.toUpperCase())}
               maxLength={16}
               className="h-8"
            />
            <Input
               placeholder="Name"
               value={name}
               onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter') void create();
               }}
               className="h-8"
            />
            <Button size="xs" onClick={() => void create()} disabled={busy} className="self-end">
               Create
            </Button>
         </PopoverContent>
      </Popover>
   );
}
