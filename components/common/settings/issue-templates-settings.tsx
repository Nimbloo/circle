'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Workspace "Issue templates" settings. O subsistema de templates ainda não
 * existe (sem backend) → estado vazio honesto + ação "Soon" desabilitada.
 */
export default function IssueTemplatesSettings() {
   return (
      <SettingsShell
         title="Issue templates"
         description="These templates are available when creating issues for any team in the workspace. To create templates that only apply to specific teams, add them as team templates."
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="No issue templates yet"
                  description="Em breve"
                  muted
                  trailing={
                     <div className="flex items-center gap-2">
                        <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                           Soon
                        </span>
                        <Button
                           size="icon"
                           variant="ghost"
                           className="size-7"
                           disabled
                           aria-label="New template"
                        >
                           <Plus className="size-4" />
                        </Button>
                     </div>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
