'use client';

import { Button } from '@/components/ui/button';
import { KeyRound, Laptop, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Inert action whose backend doesn't exist yet: disabled + "Soon" marker. */
function SoonAction({ children }: { children: ReactNode }) {
   return (
      <div className="flex items-center gap-2">
         <span className="rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Soon
         </span>
         <Button size="xs" variant="ghost" disabled>
            {children}
         </Button>
      </div>
   );
}

/** Personal "Security & access" settings (sessions, passkeys, API keys). */
export default function AccountSecurity() {
   return (
      <SettingsShell title="Security & access">
         <SettingsSection title="Sessions" description="Devices logged into your account">
            <SettingsCard>
               <SettingsRow
                  icon={<Laptop className="size-4" />}
                  title="Chrome on macOS"
                  description={
                     <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-[#00cc66]" />
                        <span className="text-[#00a05a]">Current session</span> · Paris, FR · (EN,
                        FR)
                     </span>
                  }
               />
            </SettingsCard>
            <SettingsCard>
               <SettingsRow
                  title="1 other session"
                  trailing={<SoonAction>Revoke all</SoonAction>}
               />
               <SettingsRow
                  icon={<Smartphone className="size-4" />}
                  title="Nimbloo iOS"
                  description="Paris, FR · Last seen about 3 hours ago"
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Passkeys"
            description="Passkeys are a secure way to sign in to your account"
         >
            <SettingsCard>
               <SettingsRow
                  title="No passkeys registered"
                  trailing={<SoonAction>New passkey</SoonAction>}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Personal API keys"
            description="Use the GraphQL API to build your own integrations"
         >
            <SettingsCard>
               <SettingsRow title="1 API key" trailing={<SoonAction>New API key</SoonAction>} />
               <SettingsRow
                  icon={<KeyRound className="size-4" />}
                  title={
                     <>
                        NIMBLOO_PERSONAL_API_KEY
                        <span className="text-xs text-muted-foreground font-normal">
                           · full access · public & private teams
                        </span>
                     </>
                  }
                  description="Created 2 months ago · last used on Jul 16, 2026"
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Commit signing key"
            description="Coding sessions use this key to sign your commits"
         >
            <SettingsCard>
               <SettingsRow
                  title="No signing key added"
                  trailing={<SoonAction>Add key</SoonAction>}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
