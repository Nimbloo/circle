'use client';

import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/store/preferences-store';
import { useState } from 'react';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Fake diff shown in the "Code theme" preview (invented snippet). */
const DIFF_LINES: { number?: string; text: string; kind: 'context' | 'removed' | 'added' }[] = [
   { number: '1', text: 'const config = {', kind: 'context' },
   { number: '2', text: '  apiUrl: "https://api.example.com",', kind: 'context' },
   { number: '3', text: '  timeout: 5000,', kind: 'context' },
   { number: '-', text: '  debug: true,', kind: 'removed' },
   { number: '4', text: '  headers: { "Content-Type": "application/json" },', kind: 'added' },
   { number: '5', text: '};', kind: 'context' },
   { number: '-', text: 'async function fetchUser(id: string): Promise<User> {', kind: 'removed' },
   { number: '-', text: '  const url = `${config.apiUrl}/users/${id}`;', kind: 'removed' },
   {
      number: '6',
      text: 'async function fetchUser(id: string): Promise<User | null> {',
      kind: 'added',
   },
   { number: '7', text: '  const url = `${config.apiUrl}/v2/users/${id}`;', kind: 'added' },
   { number: '8', text: '  const res = await fetch(url);', kind: 'context' },
   { number: '-', text: '  return res.json();', kind: 'removed' },
];

/**
 * Personal "Code & reviews" settings. As opções persistem por-usuário
 * (preferences-store → PUT /settings). O fluxo real de review de PR do GitHub
 * (chave de assinatura, coding tools externas) ainda não existe → "Soon".
 */
export default function AccountCodeReviews() {
   const prefs = usePreferencesStore();
   const [previewLang, setPreviewLang] = useState('TypeScript');

   return (
      <SettingsShell
         title="Code & reviews"
         description="Review GitHub pull requests and agent code diffs in Nimbloo"
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Enable code reviews"
                  description="Review GitHub pull requests, accessible from the sidebar"
                  trailing={
                     <Switch
                        checked={prefs.codeReviewsEnabled}
                        onCheckedChange={(v) => prefs.setPref('codeReviewsEnabled', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Auto-convert draft pull requests"
                  description="Automatically mark your drafts as ready upon approval or requesting a review"
                  trailing={
                     <Switch
                        checked={prefs.autoConvertDrafts}
                        onCheckedChange={(v) => prefs.setPref('autoConvertDrafts', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Merge strategy"
                  description="Choose the default merge strategy for pull requests. Repository configuration can affect available strategies"
                  trailing={
                     <SelectMenu
                        options={['Squash and merge', 'Merge commit', 'Rebase and merge']}
                        value={prefs.mergeStrategy}
                        onChange={(v) => prefs.setPref('mergeStrategy', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Code theme"
                  description="Select the syntax highlighting theme used in code diffs and viewers"
                  trailing={
                     <SelectMenu
                        options={['Nimbloo Light', 'Nimbloo Dark', 'Contrast']}
                        value={prefs.codeTheme}
                        onChange={(v) => prefs.setPref('codeTheme', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Font"
                  trailing={
                     <SelectMenu
                        options={['12px, Regular, Default', '13px, Medium']}
                        value={prefs.codeFont}
                        onChange={(v) => prefs.setPref('codeFont', v)}
                     />
                  }
               />
               <div className="p-3">
                  <div className="relative rounded-md border overflow-hidden bg-container">
                     <div className="absolute top-2 right-2 z-10">
                        <SelectMenu
                           options={['TypeScript', 'JavaScript', 'Python']}
                           value={previewLang}
                           onChange={setPreviewLang}
                        />
                     </div>
                     <pre className="text-xs leading-5 font-mono overflow-x-auto py-2">
                        {DIFF_LINES.map((line, index) => (
                           <div
                              key={index}
                              className={
                                 line.kind === 'removed'
                                    ? 'bg-red-500/10 border-l-2 border-red-500 px-3 flex gap-3'
                                    : line.kind === 'added'
                                      ? 'bg-green-500/10 border-l-2 border-green-500 px-3 flex gap-3'
                                      : 'px-3 flex gap-3 border-l-2 border-transparent'
                              }
                           >
                              <span className="w-4 text-right text-muted-foreground/60 select-none shrink-0">
                                 {line.number}
                              </span>
                              <code>{line.text}</code>
                           </div>
                        ))}
                     </pre>
                  </div>
               </div>
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Notifications"
            description="Choose which review activity appears in your inbox and push notifications"
         >
            <SettingsCard>
               <SettingsRow
                  title="Comments & reviews"
                  description="Comments, mentions, and submitted reviews"
                  trailing={
                     <SelectMenu
                        options={['Exclude Bots', 'Everyone', 'None']}
                        value={prefs.reviewComments}
                        onChange={(v) => prefs.setPref('reviewComments', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Review requests"
                  description="Requests for your personal review"
                  trailing={
                     <Switch
                        checked={prefs.reviewRequests}
                        onCheckedChange={(v) => prefs.setPref('reviewRequests', v)}
                     />
                  }
               />
               <SettingsRow
                  title="GitHub team review requests"
                  description="Requests for review from your GitHub teams with 10 or fewer members"
                  trailing={
                     <Switch
                        checked={prefs.githubTeamRequests}
                        onCheckedChange={(v) => prefs.setPref('githubTeamRequests', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Checks & merge queue"
                  description="Check failures and merge queue updates"
                  trailing={
                     <Switch
                        checked={prefs.checksMergeQueue}
                        onCheckedChange={(v) => prefs.setPref('checksMergeQueue', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Signed commits">
            <SettingsCard>
               <SettingsRow
                  title="Require signed commits"
                  description="Users must upload a signing key before starting a coding session"
                  trailing={
                     <Switch
                        checked={prefs.requireSignedCommits}
                        onCheckedChange={(v) => prefs.setPref('requireSignedCommits', v)}
                     />
                  }
               />
               <SettingsRow
                  title="No signing key added"
                  trailing={
                     <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Soon
                     </span>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="External tools">
            <SettingsCard>
               <SettingsRow
                  title="Configure coding tools"
                  description="Configure the external coding tools you can open issues in"
                  muted
                  trailing={
                     <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Soon
                     </span>
                  }
               />
               <SettingsRow
                  title="Git attachment format"
                  description="The format of GitHub/GitLab attachments on issues"
                  trailing={
                     <SelectMenu
                        options={['Title', 'URL', 'Compact']}
                        value={prefs.gitAttachmentFormat}
                        onChange={(v) => prefs.setPref('gitAttachmentFormat', v)}
                     />
                  }
               />
               <SettingsRow
                  title="On git branch copy, move issue to started status"
                  description="After copying the git branch name, issue status is moved to the team's first started workflow status. Hold ⌥ to disable."
                  trailing={
                     <Switch
                        checked={prefs.gitBranchCopyMoveStarted}
                        onCheckedChange={(v) => prefs.setPref('gitBranchCopyMoveStarted', v)}
                     />
                  }
               />
               <SettingsRow
                  title="On open in coding tool, move issue to started status"
                  description="After opening an issue in a coding tool or copying as prompt, issue status is moved to the team's first started workflow status. Hold ⌥ to disable."
                  trailing={
                     <Switch
                        checked={prefs.openCodingToolMoveStarted}
                        onCheckedChange={(v) => prefs.setPref('openCodingToolMoveStarted', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
