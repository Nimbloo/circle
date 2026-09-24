'use client';

import { usePreferencesStore } from '@/store/preferences-store';
import { Check } from 'lucide-react';
import { SettingsSection, SettingsShell } from './shared';

/**
 * Personal settings for the workspace agent. A `Guidance` persiste por-usuário
 * (preferences-store → PUT /settings).
 */
export default function AgentPersonalization() {
   const guidance = usePreferencesStore((s) => s.agentGuidance);
   const setPref = usePreferencesStore((s) => s.setPref);
   return (
      <SettingsShell
         title="Agent personalization"
         description="Your personal settings for the Nimbloo Agent"
      >
         <SettingsSection
            title="Guidance"
            description="Provide personal instructions and context for the agent when responding to conversations"
         >
            <textarea
               placeholder="Enter personal guidance for the agent (optional)..."
               value={guidance}
               maxLength={8000}
               onChange={(e) => setPref('agentGuidance', e.target.value)}
               className="w-full min-h-36 rounded-lg border bg-container p-4 text-sm outline-none resize-y placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
               <Check className="size-3.5 text-success" />
               Saved automatically to your account
            </p>
         </SettingsSection>
      </SettingsShell>
   );
}
