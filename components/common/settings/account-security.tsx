'use client';

import { Button } from '@/components/ui/button';
import { Laptop } from 'lucide-react';
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

/**
 * Personal "Security & access" settings. Sessões, passkeys, API keys e chave de
 * assinatura dependem de subsistemas ainda não construídos → estados honestos
 * (sem dados fabricados) + ações "Soon" desabilitadas.
 */
export default function AccountSecurity() {
   return (
      <SettingsShell title="Security & access">
         <SettingsSection title="Sessions" description="Devices logged into your account">
            <SettingsCard>
               <SettingsRow
                  icon={<Laptop className="size-4" />}
                  title="This device"
                  description={
                     <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-[#00cc66]" />
                        <span className="text-[#00a05a]">Current session</span>
                     </span>
                  }
               />
            </SettingsCard>
            <SettingsCard>
               <SettingsRow
                  title="No other active sessions"
                  muted
                  trailing={<SoonAction>Revoke all</SoonAction>}
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
                  muted
                  trailing={<SoonAction>New passkey</SoonAction>}
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Personal API keys"
            description="Use the GraphQL API to build your own integrations"
         >
            <SettingsCard>
               <SettingsRow
                  title="No API keys"
                  muted
                  trailing={<SoonAction>New API key</SoonAction>}
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
                  muted
                  trailing={<SoonAction>Add key</SoonAction>}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
