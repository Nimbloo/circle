'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal "Profile" settings. */
export default function Profile() {
   const me = useWorkspaceStore((s) => s.me);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [name, setName] = useState(me?.name ?? '');
   const [saving, setSaving] = useState(false);

   // Mantém o input em sincronia quando o workspace (re)hidrata.
   useEffect(() => {
      if (me?.name) setName(me.name);
   }, [me?.name]);

   const saveName = async () => {
      const next = name.trim();
      if (!me || saving || !next || next === me.name) return;
      setSaving(true);
      try {
         await api.me.update({ name: next });
         await hydrate();
         toast.success('Name updated');
      } catch {
         toast.error('Could not update your name');
         setName(me.name);
      } finally {
         setSaving(false);
      }
   };

   if (!me) {
      return (
         <SettingsShell title="Profile">
            <SettingsSection>
               <SettingsCard>
                  <SettingsRow title="Loading…" />
               </SettingsCard>
            </SettingsSection>
         </SettingsShell>
      );
   }

   return (
      <SettingsShell title="Profile">
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Profile picture"
                  trailing={
                     <Avatar className="size-9">
                        <AvatarImage src={me.avatarUrl ?? undefined} alt={me.name} />
                        <AvatarFallback>{me.name[0]}</AvatarFallback>
                     </Avatar>
                  }
               />
               <SettingsRow
                  title="Email"
                  trailing={
                     <span className="inline-flex items-center gap-2 text-foreground">
                        {me.email}
                        <Button size="icon" variant="ghost" className="size-6">
                           <Pencil className="size-3" />
                        </Button>
                     </span>
                  }
               />
               <SettingsRow
                  title="Full name"
                  trailing={
                     <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => void saveName()}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        disabled={saving}
                        className="h-8 w-44"
                     />
                  }
               />
               <SettingsRow
                  title="Title"
                  description="Your job title or role"
                  trailing={<Input placeholder="Software engineer" className="h-8 w-44" />}
               />
               <SettingsRow
                  title="Username"
                  description="One word, like a nickname or first name"
                  trailing={<Input defaultValue={me.slug} disabled className="h-8 w-44" />}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Workspace access">
            <SettingsCard>
               <SettingsRow
                  title="Remove yourself from workspace"
                  trailing={
                     <Button size="xs" variant="ghost" className="text-red-500 hover:text-red-500">
                        Leave workspace
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
