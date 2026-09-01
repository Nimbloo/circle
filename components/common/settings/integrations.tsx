'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { ChevronRight, Search, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { INTEGRATION_LOGOS } from './integration-logos';
import { SlackEventsConfig } from './slack-events-config';
import { SettingsShell } from './shared';
import {
   ENABLED_INTEGRATIONS,
   INTEGRATION_CATEGORIES,
   INTEGRATIONS,
   Integration,
} from './integrations-data';

/** How many cards a category shows before "Show all". */
const VISIBLE_PER_CATEGORY = 8;

function IntegrationIcon({ integration, size = 36 }: { integration: Integration; size?: number }) {
   const Logo = INTEGRATION_LOGOS[integration.id];
   if (Logo) {
      return (
         <span
            className="rounded-md border bg-background inline-flex items-center justify-center shrink-0"
            style={{ width: size, height: size }}
            aria-hidden
         >
            <Logo className="size-[60%]" />
         </span>
      );
   }
   const initials = integration.name
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
   return (
      <span
         className="rounded-md inline-flex items-center justify-center font-semibold text-white shrink-0 select-none"
         style={{
            width: size,
            height: size,
            backgroundColor: integration.color,
            fontSize: size * 0.34,
         }}
         aria-hidden
      >
         {initials}
      </span>
   );
}

function StatusBadge({ status }: { status: NonNullable<Integration['status']> }) {
   return (
      <span className="text-[11px] text-muted-foreground border rounded px-1 py-px leading-none shrink-0">
         {status === 'enabled' ? 'Enabled' : 'Pre-installed'}
      </span>
   );
}

/**
 * Cartão do diretório de integrações. É read-only (`div`, não `button`): o fluxo
 * de conexão real (OAuth de terceiros) ainda não existe — evita afordância falsa
 * de clique. O status ("Enabled"/"Pre-installed") vem dos dados do diretório.
 */
function ConnectedBadge() {
   return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-[color:var(--online-indicator)]/40 bg-[color:var(--online-indicator)]/10 px-1 py-px text-[11px] font-medium leading-none text-[var(--online-indicator)]">
         <span className="size-1.5 rounded-full bg-[var(--online-indicator)]" />
         Conectado
      </span>
   );
}

function IntegrationCard({
   integration,
   connected,
}: {
   integration: Integration;
   connected?: boolean;
}) {
   return (
      <div className="flex min-h-[154px] flex-col rounded-[10px] border border-border/70 bg-card p-4 text-left">
         <div className="flex min-w-0 items-center gap-2.5">
            <IntegrationIcon integration={integration} />
            <span className="flex min-w-0 items-center gap-2">
               <span className="text-sm font-medium truncate">{integration.name}</span>
               {connected ? (
                  <ConnectedBadge />
               ) : (
                  integration.status && <StatusBadge status={integration.status} />
               )}
            </span>
         </div>
         <p className="mt-3 line-clamp-3 text-[13px] leading-[18px] text-muted-foreground">
            {integration.description}
         </p>
      </div>
   );
}

function EnabledIntegrationCard({ integration }: { integration: Integration }) {
   return (
      <div className="flex h-[72px] w-full items-center gap-2 rounded-[10px] border border-border/70 bg-card px-4">
         <IntegrationIcon integration={integration} />
         <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-4">
               {integration.name}
            </span>
            <span className="block text-[12px] leading-[15px] text-muted-foreground">Enabled</span>
         </span>
      </div>
   );
}

function FeaturedIntegration() {
   const integration = INTEGRATIONS.slack;
   const featuredTabs = ['asks-for-slack', 'slack', 'github', 'figma', 'intercom'];

   return (
      <div className="mt-12">
         <div className="relative h-[382px] overflow-hidden rounded-[10px] bg-primary/15 p-4">
            <span className="inline-flex h-6 items-center rounded-md bg-background/90 px-2 text-[11px] font-medium uppercase text-foreground">
               Essentials
            </span>
            <div className="absolute right-12 top-8 w-[272px] rounded-[10px] border border-border/70 bg-background/90 p-4 shadow-[var(--popover-shadow)]">
               <div className="flex items-center gap-2 text-[12px] font-medium">
                  <IntegrationIcon integration={integration} size={24} />
                  Create a new issue
               </div>
               <div className="mt-4 space-y-3">
                  <div className="h-8 rounded-md border bg-card" />
                  <div className="h-8 rounded-md border bg-card" />
                  <div className="h-20 rounded-md border bg-card" />
                  <div className="h-8 rounded-md border bg-card" />
               </div>
            </div>
            <div className="absolute inset-x-4 bottom-4 flex items-center gap-3">
               <IntegrationIcon integration={integration} size={56} />
               <span>
                  <span className="block text-base font-medium">Slack</span>
                  <span className="block text-sm text-muted-foreground">
                     {integration.description}
                  </span>
               </span>
            </div>
         </div>
         <div className="flex h-[60px] items-center gap-6 overflow-hidden px-4">
            {featuredTabs.map((id) => {
               const item = INTEGRATIONS[id];
               return (
                  <div
                     key={id}
                     className={cn(
                        'flex shrink-0 items-center gap-2 text-[13px] font-medium',
                        id === 'slack' ? 'text-foreground' : 'text-muted-foreground'
                     )}
                  >
                     <IntegrationIcon integration={item} size={20} />
                     {item.name}
                  </div>
               );
            })}
         </div>
      </div>
   );
}

function CategorySection({
   label,
   items,
   connectedIds,
}: {
   label: string;
   items: Integration[];
   connectedIds: Set<string>;
}) {
   const [expanded, setExpanded] = useState(false);
   const visible = expanded ? items : items.slice(0, VISIBLE_PER_CATEGORY);
   return (
      <section className="mt-12">
         <h2 className="px-4 text-[12px] font-medium uppercase leading-[15px] text-muted-foreground">
            {label}
         </h2>
         <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {visible.map((integration) => (
               <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  connected={connectedIds.has(integration.id)}
               />
            ))}
         </div>
         {!expanded && items.length > VISIBLE_PER_CATEGORY && (
            <button
               onClick={() => setExpanded(true)}
               className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
               Show all
               <ChevronRight className="size-3" />
            </button>
         )}
      </section>
   );
}

/**
 * Workspace "Integrations" directory (settings/integrations): search,
 * enabled integrations and categorized integration cards.
 */
export default function Integrations() {
   const [query, setQuery] = useState('');

   // Quais integrações estão realmente CONFIGURADAS (por env, via API) → badge "Conectado".
   // Mapa status→id do card do diretório (o Sentry aqui é o card "sentry-agent").
   const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
   useEffect(() => {
      let alive = true;
      void api.integrations
         .status()
         .then((s) => {
            if (!alive) return;
            const ids = new Set<string>();
            if (s.github) ids.add('github');
            if (s.slack) {
               ids.add('slack');
               ids.add('asks-for-slack');
            }
            if (s.sentry) ids.add('sentry-agent');
            setConnectedIds(ids);
         })
         .catch(() => {
            /* silencioso — sem badge se o status falhar */
         });
      return () => {
         alive = false;
      };
   }, []);

   const [slackTesting, setSlackTesting] = useState(false);
   const testSlack = async () => {
      setSlackTesting(true);
      try {
         const res = await api.integrations.slackTest();
         if (res.sent) toast.success('Mensagem de teste enviada ao Slack ✅');
         else toast.error(`Slack não enviou (${res.reason ?? 'erro'})`);
      } catch {
         toast.error('Falha ao testar o Slack (só admin)');
      } finally {
         setSlackTesting(false);
      }
   };

   const searchResults = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return null;
      return Object.values(INTEGRATIONS).filter(
         (integration) =>
            integration.name.toLowerCase().includes(needle) ||
            integration.description.toLowerCase().includes(needle)
      );
   }, [query]);

   return (
      <SettingsShell
         title="Integrations"
         description="Enhance your workspace with a wide variety of add-ons and integrations"
      >
         <div className="mt-[11px]">
            <div className="relative mx-px w-[calc(100%-2px)]">
               <Search className="size-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
               <Input
                  placeholder="Search integrations"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-11 pl-9"
               />
            </div>

            {connectedIds.has('slack') && (
               <div className="mt-6 flex items-center justify-between rounded-lg border border-[color:var(--online-indicator)]/30 bg-[color:var(--online-indicator)]/5 px-4 py-2.5">
                  <span className="text-sm">
                     <span className="font-medium">Slack conectado.</span>{' '}
                     <span className="text-muted-foreground">
                        Notificações do Circle vão pro seu canal.
                     </span>
                  </span>
                  <Button size="xs" variant="secondary" disabled={slackTesting} onClick={testSlack}>
                     <Send className="size-3.5" />
                     {slackTesting ? 'Enviando…' : 'Enviar teste'}
                  </Button>
               </div>
            )}

            {connectedIds.has('slack') && (
               <div className="mt-3">
                  <SlackEventsConfig />
               </div>
            )}

            {searchResults ? (
               <section className="mt-12">
                  <h2 className="px-4 text-[12px] font-medium uppercase leading-[15px] text-muted-foreground">
                     {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
                  </h2>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                     {searchResults.map((integration) => (
                        <IntegrationCard
                           key={integration.id}
                           integration={integration}
                           connected={connectedIds.has(integration.id)}
                        />
                     ))}
                  </div>
               </section>
            ) : (
               <>
                  <section className="mt-12">
                     <h2 className="px-4 text-[12px] font-medium uppercase leading-[15px] text-muted-foreground">
                        Enabled
                     </h2>
                     <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {ENABLED_INTEGRATIONS.slice(0, 3).map((integration) => (
                           <EnabledIntegrationCard key={integration.id} integration={integration} />
                        ))}
                     </div>
                  </section>

                  <FeaturedIntegration />

                  {INTEGRATION_CATEGORIES.map((category) => (
                     <CategorySection
                        connectedIds={connectedIds}
                        key={category.id}
                        label={category.label}
                        items={category.items.map((id) => INTEGRATIONS[id])}
                     />
                  ))}
               </>
            )}
         </div>
      </SettingsShell>
   );
}
