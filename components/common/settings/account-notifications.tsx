'use client';

import { Switch } from '@/components/ui/switch';
import { useNotificationPrefsStore } from '@/store/notification-prefs-store';
import { Mail, Slack } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal notification settings: os canais que o servidor honra (`notify.ts`). */
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
                        aria-label="Email notifications"
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
                        aria-label="Slack notifications"
                        checked={prefs.slackNotifications}
                        onCheckedChange={(v) => prefs.setPref('slackNotifications', v)}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
