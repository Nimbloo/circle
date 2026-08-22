'use client';

import { Switch } from '@/components/ui/switch';
import { useNotificationPrefsStore } from '@/store/notification-prefs-store';
import { Mail, Monitor, Slack, Smartphone } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal notification settings (push channels + product updates). */
export default function AccountNotifications() {
   const prefs = useNotificationPrefsStore();
   return (
      <SettingsShell title="Notifications">
         <SettingsSection
            title="Notification channels"
            description="Escolha por onde receber notificações de issues (atribuição, comentários, menções). O histórico completo sempre aparece no seu inbox."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<Mail className="size-4" />}
                  title="Email"
                  description="Recebe um e-mail quando algo importante acontece nas suas issues"
                  trailing={
                     <Switch
                        checked={prefs.emailNotifications}
                        onCheckedChange={(v) => prefs.setPref('emailNotifications', v)}
                     />
                  }
               />
               <SettingsRow
                  icon={<Slack className="size-4" />}
                  title="Slack"
                  description="Envia as notificações para o canal do Slack conectado ao workspace"
                  trailing={
                     <Switch
                        checked={prefs.slackNotifications}
                        onCheckedChange={(v) => prefs.setPref('slackNotifications', v)}
                     />
                  }
               />
               <SettingsRow
                  icon={<Monitor className="size-4" />}
                  title="Desktop"
                  description="Em breve"
                  muted
               />
               <SettingsRow
                  icon={<Smartphone className="size-4" />}
                  title="Mobile"
                  description="Em breve"
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Updates from Nimbloo"
            description="Subscribe to product announcements and important changes from the Nimbloo team"
         >
            <h3 className="text-sm font-medium mt-2">Changelog</h3>
            <SettingsCard>
               <SettingsRow
                  title="Show updates in sidebar"
                  description="Highlight new features and improvements in the app sidebar"
                  trailing={
                     <Switch
                        checked={prefs.showUpdatesInSidebar}
                        onCheckedChange={(v) => prefs.setPref('showUpdatesInSidebar', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Changelog newsletter"
                  description="Receive an email twice a month highlighting new features and improvements"
                  trailing={
                     <Switch
                        checked={prefs.changelogNewsletter}
                        onCheckedChange={(v) => prefs.setPref('changelogNewsletter', v)}
                     />
                  }
               />
            </SettingsCard>

            <h3 className="text-sm font-medium mt-2">Marketing</h3>
            <SettingsCard>
               <SettingsRow
                  title="Marketing and onboarding"
                  description="Occasional updates to help you get the most out of Nimbloo"
                  trailing={
                     <Switch
                        checked={prefs.marketing}
                        onCheckedChange={(v) => prefs.setPref('marketing', v)}
                     />
                  }
               />
            </SettingsCard>

            <h3 className="text-sm font-medium mt-2">Other updates</h3>
            <SettingsCard>
               <SettingsRow
                  title="Invite accepted"
                  description="Receive an email when an invite you sent is accepted"
                  trailing={
                     <Switch
                        checked={prefs.inviteAccepted}
                        onCheckedChange={(v) => prefs.setPref('inviteAccepted', v)}
                     />
                  }
               />
               <SettingsRow
                  title="Privacy and legal updates"
                  description="Important updates about terms of service or privacy policy changes"
                  trailing={
                     <Switch
                        checked={prefs.privacyLegal}
                        onCheckedChange={(v) => prefs.setPref('privacyLegal', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
