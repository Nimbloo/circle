'use client';

import { Switch } from '@/components/ui/switch';
import {
   CODE_FONT_DEFAULT,
   CODE_FONT_MEDIUM,
   usePreferencesStore,
} from '@/store/preferences-store';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Personal "Code & reviews" settings. As opções persistem por-usuário
 * (preferences-store → PUT /settings) e todas têm efeito real: "Enable code reviews"
 * controla a aba Reviews no sidebar, "Font" o diff dos reviews, e os dois toggles de
 * "External tools" movem a issue para started ao copiar o branch / o prompt. Opções que
 * dependiam de ações no GitHub que o Circle não executa (merge, drafts, merge queue,
 * commits assinados, notificações de review) foram removidas.
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
            </SettingsCard>
         </SettingsSection>

         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Font"
                  description="Font used in code diffs"
                  trailing={
                     <SelectMenu
                        ariaLabel="Code font"
                        options={[CODE_FONT_DEFAULT, CODE_FONT_MEDIUM]}
                        value={prefs.codeFont}
                        onChange={(v) => prefs.setPref('codeFont', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="External tools">
            <SettingsCard>
               <SettingsRow
                  title="On git branch copy, move issue to started status"
                  description="After copying the git branch name, issue status is moved to the team's first started workflow status"
                  trailing={
                     <Switch
                        aria-label="On git branch copy, move issue to started status"
                        checked={prefs.gitBranchCopyMoveStarted}
                        onCheckedChange={(v) => prefs.setPref('gitBranchCopyMoveStarted', v)}
                     />
                  }
               />
               <SettingsRow
                  title="On copy as prompt, move issue to started status"
                  description="After copying an issue as a prompt, issue status is moved to the team's first started workflow status"
                  trailing={
                     <Switch
                        aria-label="On copy as prompt, move issue to started status"
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
