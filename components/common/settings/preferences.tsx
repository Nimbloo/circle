'use client';

import { CustomizeSidebarDialog } from '@/components/layout/sidebar/customize-sidebar-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_HOME_VIEW, HOME_VIEW_OPTIONS } from '@/lib/home-view';
import { usePreferencesStore } from '@/store/preferences-store';
import { useState } from 'react';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';
import { ThemePreferences } from './theme-preferences';

/**
 * Personal "Preferences" settings. Toda escolha persiste por-usuário
 * (preferences-store → PUT /settings, sincronizado entre dispositivos) e tem efeito
 * real: `Font size`, `Use pointer cursors` e `Underline links` pelo PreferencesApplier;
 * as demais no ponto de uso (ver o comentário de store/preferences-store.ts).
 */
export default function Preferences() {
   const [customizeOpen, setCustomizeOpen] = useState(false);
   const prefs = usePreferencesStore();
   return (
      <SettingsShell title="Preferences">
         <SettingsSection title="General">
            <SettingsCard>
               <SettingsRow
                  title="Default home view"
                  description="Select which view to display when launching the app"
                  trailing={
                     <SelectMenu
                        ariaLabel="Default home view"
                        options={[...HOME_VIEW_OPTIONS]}
                        value={
                           (HOME_VIEW_OPTIONS as readonly string[]).includes(prefs.defaultHomeView)
                              ? prefs.defaultHomeView
                              : DEFAULT_HOME_VIEW
                        }
                        onChange={(v) => prefs.setPref('defaultHomeView', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Display names"
                  description="Select how names are displayed in the interface"
                  trailing={
                     <SelectMenu
                        ariaLabel="Display names"
                        options={['Full name', 'Username']}
                        value={prefs.displayNames}
                        onChange={(v) => prefs.setPref('displayNames', v)}
                     />
                  }
               />
               <SettingsRow
                  title="First day of the week"
                  description="Used for date pickers"
                  trailing={
                     <SelectMenu
                        ariaLabel="First day of the week"
                        options={['Monday', 'Sunday', 'Saturday']}
                        value={prefs.firstDayOfWeek}
                        onChange={(v) => prefs.setPref('firstDayOfWeek', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Convert text emoticons into emojis"
                  description="Strings like :) will be converted to 🙂"
                  trailing={
                     <Switch
                        aria-label="Convert text emoticons into emojis"
                        checked={prefs.convertEmoticons}
                        onCheckedChange={(v) => prefs.setPref('convertEmoticons', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Send comments on..."
                  description="Choose which key press is used to submit comments"
                  trailing={
                     <SelectMenu
                        ariaLabel="Send comments on"
                        options={['⌘+Enter', 'Enter']}
                        value={prefs.sendCommentsOn}
                        onChange={(v) => prefs.setPref('sendCommentsOn', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Interface and theme">
            <SettingsCard>
               <SettingsRow
                  title="App sidebar"
                  description="Customize sidebar item visibility, ordering, and badge style"
                  trailing={
                     <Button size="xs" variant="ghost" onClick={() => setCustomizeOpen(true)}>
                        Customize
                     </Button>
                  }
               />
               <SettingsRow
                  title="Font size"
                  description="Adjust the size of text across the app"
                  trailing={
                     <SelectMenu
                        ariaLabel="Font size"
                        options={['Default', 'Small', 'Large']}
                        value={prefs.fontSize}
                        onChange={(v) => prefs.setPref('fontSize', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Use pointer cursors"
                  description="Change the cursor to a pointer when hovering over any interactive elements"
                  trailing={
                     <Switch
                        aria-label="Use pointer cursors"
                        checked={prefs.pointerCursors}
                        onCheckedChange={(v) => prefs.setPref('pointerCursors', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Underline links"
                  description="Always underline links in text content"
                  trailing={
                     <Switch
                        aria-label="Underline links"
                        checked={prefs.underlineLinks}
                        onCheckedChange={(v) => prefs.setPref('underlineLinks', v)}
                     />
                  }
               />
            </SettingsCard>
            <ThemePreferences />
         </SettingsSection>

         <SettingsSection title="Automations and workflows">
            <SettingsCard>
               <SettingsRow
                  title="Auto-assign to self"
                  description="When creating new issues, always assign them to yourself by default"
                  trailing={
                     <Switch
                        aria-label="Auto-assign to self"
                        checked={prefs.autoAssignSelf}
                        onCheckedChange={(v) => prefs.setPref('autoAssignSelf', v)}
                     />
                  }
               />
               <SettingsRow
                  title="On move to started status, assign to yourself"
                  description="When you move an unassigned issue to started, it will be automatically assigned to you"
                  trailing={
                     <Switch
                        aria-label="On move to started status, assign to yourself"
                        checked={prefs.assignSelfOnStart}
                        onCheckedChange={(v) => prefs.setPref('assignSelfOnStart', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>
         <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
      </SettingsShell>
   );
}
