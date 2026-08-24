'use client';

import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/store/preferences-store';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Selo "Soon" — a linha existe (paridade com o Linear) mas o subsistema que a torna
 *  efetiva (GitHub App: PR automation, merge queue, coding tools) ainda não existe. */
function Soon() {
   return (
      <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
         Soon
      </span>
   );
}

/**
 * Personal "Code & reviews" settings. A ÚNICA opção efetiva hoje é "Enable code
 * reviews", que mostra/oculta a aba Reviews no sidebar (as reviews são INGESTÃO
 * read-only de PRs). Todo o resto (auto-convert de draft, merge strategy/queue,
 * checks, signed commits, coding tools) depende de um GitHub App que o Circle ainda
 * não tem — então essas linhas ficam marcadas "Soon" em vez de fingir que persistem
 * um efeito (antes eram toggles que gravavam sem fazer nada).
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
                        checked={prefs.codeReviewsEnabled}
                        onCheckedChange={(v) => prefs.setPref('codeReviewsEnabled', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Auto-convert draft pull requests"
                  description="Automatically mark your drafts as ready upon approval or requesting a review"
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="Merge strategy"
                  description="Choose the default merge strategy for pull requests. Repository configuration can affect available strategies"
                  muted
                  trailing={<Soon />}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Code theme"
                  description="Select the syntax highlighting theme used in code diffs and viewers"
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow title="Font" muted trailing={<Soon />} />
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
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="Review requests"
                  description="Requests for your personal review"
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="GitHub team review requests"
                  description="Requests for review from your GitHub teams with 10 or fewer members"
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="Checks & merge queue"
                  description="Check failures and merge queue updates"
                  muted
                  trailing={<Soon />}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Signed commits">
            <SettingsCard>
               <SettingsRow
                  title="Require signed commits"
                  description="Users must upload a signing key before starting a coding session"
                  muted
                  trailing={<Soon />}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="External tools">
            <SettingsCard>
               <SettingsRow
                  title="Configure coding tools"
                  description="Configure the external coding tools you can open issues in"
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="Git attachment format"
                  description="The format of GitHub/GitLab attachments on issues"
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="On git branch copy, move issue to started status"
                  description="After copying the git branch name, issue status is moved to the team's first started workflow status. Hold ⌥ to disable."
                  muted
                  trailing={<Soon />}
               />
               <SettingsRow
                  title="On open in coding tool, move issue to started status"
                  description="After opening an issue in a coding tool or copying as prompt, issue status is moved to the team's first started workflow status. Hold ⌥ to disable."
                  muted
                  trailing={<Soon />}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
