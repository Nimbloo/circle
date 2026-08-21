'use client';

import { CustomizeSidebarDialog } from '@/components/layout/sidebar/customize-sidebar-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/store/preferences-store';
import { useState } from 'react';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';
import { ThemePreferences } from './theme-preferences';

/**
 * Personal "Preferences" settings. Toda escolha persiste por-usuário
 * (preferences-store → PUT /settings, sincronizado entre dispositivos).
 * `Font size`, `Use pointer cursors` e `Underline links` são honrados no app
 * inteiro pelo PreferencesApplier; as demais persistem (o efeito no fluxo quente
 * depende de subsistemas ainda não construídos).
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
                        options={['Agent (default)', 'Inbox', 'My issues']}
                        value={prefs.defaultHomeView}
                        onChange={(v) => prefs.setPref('defaultHomeView', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Display names"
                  description="Select how names are displayed in the interface"
                  trailing={
                     <SelectMenu
                        options={['Username', 'Full name']}
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
                        checked={prefs.underlineLinks}
                        onCheckedChange={(v) => prefs.setPref('underlineLinks', v)}
                     />
                  }
               />
            </SettingsCard>
            <ThemePreferences />
         </SettingsSection>

         <SettingsSection title="Desktop application">
            <SettingsCard>
               <SettingsRow
                  title="Open in desktop app"
                  description="Em breve"
                  muted
                  trailing={
                     <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Soon
                     </span>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Automations and workflows">
            <SettingsCard>
               <SettingsRow
                  title="Auto-assign to self"
                  description="When creating new issues, always assign them to yourself by default"
                  trailing={
                     <Switch
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
