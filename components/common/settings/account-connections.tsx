'use client';

import { Button } from '@/components/ui/button';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { INTEGRATION_LOGOS } from './integration-logos';
import { EnabledDot, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const SlackLogo = INTEGRATION_LOGOS['slack'];
const GoogleCalendarLogo = INTEGRATION_LOGOS['google-calendar'];
const NotionLogo = INTEGRATION_LOGOS['notion'];
const GithubLogo = INTEGRATION_LOGOS['github'];

const ConnectedTrailing = () => (
   <span className="inline-flex items-center gap-1.5 text-sm">
      <EnabledDot>
         <span className="text-foreground">Connected</span>
      </EnabledDot>
      <ChevronDown className="size-3.5 text-muted-foreground" />
   </span>
);

/** Personal "Connected accounts" settings. */
export default function AccountConnections() {
   return (
      <SettingsShell
         title="Connected accounts"
         description="Connect your user accounts to sync attribution of your actions between apps"
      >
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  icon={<SlackLogo className="size-4" />}
                  title="Slack"
                  description="Sync your message attribution, and receive notifications in Slack"
                  trailing={<ConnectedTrailing />}
               />
            </SettingsCard>
            <SettingsCard>
               <SettingsRow
                  icon={<GoogleCalendarLogo className="size-4" />}
                  title="Google Calendar"
                  description="Sync your calendar out-of-office status to Nimbloo"
                  trailing={<ConnectedTrailing />}
               />
            </SettingsCard>
            <SettingsCard>
               <SettingsRow
                  icon={<NotionLogo className="size-4" />}
                  title="Notion"
                  description="Preview issues, projects, and views within Notion"
                  trailing={
                     <div className="flex items-center gap-2">
                        <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                           Soon
                        </span>
                        <Button size="xs" variant="ghost" disabled>
                           Connect
                           <ArrowUpRight className="size-3.5" />
                        </Button>
                     </div>
                  }
               />
            </SettingsCard>
            <SettingsCard>
               <SettingsRow
                  icon={<GithubLogo className="size-4" />}
                  title={
                     <>
                        GitHub
                        <span className="text-xs text-muted-foreground font-normal">
                           · @nimbloo
                        </span>
                     </>
                  }
               />
               <SettingsRow
                  title="octo-relay"
                  description="Review code in Nimbloo and sync attribution of your git-related actions"
                  trailing={<ConnectedTrailing />}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
