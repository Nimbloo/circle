'use client';

import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/store/preferences-store';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Personal "Code & reviews" settings. As opções persistem por-usuário
 * (preferences-store → PUT /settings). "Enable code reviews" controla a aba Reviews
 * no sidebar (efeito real). O fluxo completo de review de PR (auto-convert de drafts,
 * merge queue, chave de assinatura) depende de integrações que ainda não existem.
 */
export default function AccountCodeReviews() {
   const prefs = usePreferencesStore();

   return (
      <SettingsShell
         title="Code & reviews"
         description="Revise pull requests do GitHub no Circle, a partir da aba Reviews no sidebar"
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Enable code reviews"
                  description="Mostra a aba Reviews no sidebar para revisar pull requests do GitHub"
                  trailing={
                     <Switch
                        aria-label="Enable code reviews"
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
                        aria-label="Auto-convert draft pull requests"
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
                        ariaLabel="Merge strategy"
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
                        ariaLabel="Code theme"
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
                        ariaLabel="Code font"
                        options={['12px, Regular, Default', '13px, Medium']}
                        value={prefs.codeFont}
                        onChange={(v) => prefs.setPref('codeFont', v)}
                     />
                  }
               />
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
                        ariaLabel="Comments and reviews"
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
                        aria-label="Review requests"
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
                        aria-label="GitHub team review requests"
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
                        aria-label="Checks and merge queue"
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
                        aria-label="Require signed commits"
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
                        ariaLabel="Git attachment format"
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
                        aria-label="On git branch copy, move issue to started status"
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
                        aria-label="On open in coding tool, move issue to started status"
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
