'use client';

import { Bot, Radar, RefreshCcw, Sparkles, Terminal } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const AGENT_FEATURES = [
   {
      icon: <Bot className="size-4" />,
      title: 'Nimbloo Agent',
      description: 'Configure for your workspace',
   },
   {
      icon: <Terminal className="size-4" />,
      title: 'Coding sessions',
      description: 'Assign or ask the agent to make code changes',
   },
   {
      icon: <RefreshCcw className="size-4" />,
      title: 'Loops',
      description: 'Automated agent workflows that run on a schedule or when an issue is updated',
   },
   {
      icon: <Sparkles className="size-4" />,
      title: 'Code Intelligence',
      beta: true,
      description: 'Allow the agent to analyze and answer questions about your repositories',
   },
   {
      icon: <Radar className="size-4" />,
      title: 'Triage Intelligence',
      description:
         'Find related issues and infer properties like team, project, labels, and assignee',
   },
];

/** Workspace "AI & Agents" settings. */
export default function AiAgents() {
   return (
      <SettingsShell
         title="AI & Agents"
         description="Automate your product development processes and operations with AI"
      >
         <SettingsSection
            title="Nimbloo Agent"
            description="Create issues and answer questions about your workspace"
         >
            <SettingsCard>
               {AGENT_FEATURES.map((feature) => (
                  <SettingsRow
                     key={feature.title}
                     icon={feature.icon}
                     title={
                        <>
                           {feature.title}
                           {feature.beta && (
                              <span className="text-[10px] font-medium uppercase tracking-wide border rounded px-1 py-px text-muted-foreground">
                                 Beta
                              </span>
                           )}
                        </>
                     }
                     description={feature.description}
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
