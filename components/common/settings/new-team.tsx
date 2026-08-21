'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** "Join or create a team" settings page. */
export default function NewTeam() {
   const teams = useWorkspaceStore((s) => s.teams);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const notJoined = teams.filter((team) => !team.joined);

   const [key, setKey] = useState('');
   const [name, setName] = useState('');
   const [busy, setBusy] = useState(false);

   const create = async () => {
      const id = key.trim().toUpperCase();
      if (!id || !name.trim() || busy) return;
      setBusy(true);
      try {
         await api.teams.create({ id, name: name.trim() });
         await hydrate();
         setKey('');
         setName('');
         toast.success(`Team ${id} created`);
      } catch {
         toast.error('Could not create the team (key inválida ou já existe)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <SettingsShell
         title="Join or create a team"
         description="Teams organize issues, cycles and projects around the people working together"
      >
         <SettingsSection title="Create a new team">
            <SettingsCard>
               <div className="flex items-center gap-3 p-4">
                  <Input
                     placeholder="Key, e.g. CORE"
                     value={key}
                     onChange={(e) => setKey(e.target.value.toUpperCase())}
                     maxLength={16}
                     className="h-8 w-32"
                  />
                  <Input
                     placeholder="Team name, e.g. Mobile"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void create();
                     }}
                     className="h-8 flex-1"
                  />
                  <Button
                     size="xs"
                     onClick={() => void create()}
                     disabled={busy || !key.trim() || !name.trim()}
                  >
                     Create team
                  </Button>
               </div>
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Join an existing team">
            <SettingsCard>
               {notJoined.map((team) => (
                  <SettingsRow
                     key={team.id}
                     icon={<span className="text-sm">{team.icon}</span>}
                     title={team.name}
                     description={`${team.members.length} members · ${team.projects.length} projects`}
                     trailing={
                        <div className="flex items-center gap-2">
                           <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Soon
                           </span>
                           <Button size="xs" variant="secondary" disabled>
                              <Check className="size-3.5" />
                              Join
                           </Button>
                        </div>
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
