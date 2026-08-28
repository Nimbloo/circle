'use client';

import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/client';
import type { SlackConfigDto } from '@/lib/api/integrations/slack';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const EVENTS: { key: keyof SlackConfigDto; label: string; hint: string }[] = [
   { key: 'onIssueCreated', label: 'Issue criada', hint: 'Toda issue nova' },
   { key: 'onIssueCompleted', label: 'Issue concluída', hint: 'Entrou em status concluído' },
   { key: 'onIssueAssigned', label: 'Issue atribuída', hint: 'Recebeu um responsável' },
   { key: 'onPrMerged', label: 'PR mergeado', hint: 'PR do GitHub concluiu a issue' },
];

/**
 * Toggles dos eventos que notificam o canal do Slack (feed). Leitura é aberta;
 * a gravação é admin-only (o PATCH retorna 403 → toast). Otimista com revert.
 */
export function SlackEventsConfig() {
   const [cfg, setCfg] = useState<SlackConfigDto | null>(null);

   useEffect(() => {
      let alive = true;
      void api.integrations
         .slackConfig()
         .then((c) => alive && setCfg(c))
         .catch(() => {});
      return () => {
         alive = false;
      };
   }, []);

   const toggle = async (key: keyof SlackConfigDto, value: boolean) => {
      if (!cfg) return;
      const prev = cfg;
      setCfg({ ...cfg, [key]: value }); // otimista
      try {
         const next = await api.integrations.updateSlackConfig({ [key]: value });
         setCfg(next);
      } catch {
         setCfg(prev); // revert
         toast.error('Só admin pode mudar as notificações do Slack');
      }
   };

   if (!cfg) return null;

   return (
      <div className="rounded-lg border bg-container divide-y">
         <div className="px-4 py-2.5">
            <span className="text-sm font-medium">Notificações no canal</span>
            <p className="text-xs text-muted-foreground">
               Quais eventos disparam mensagem no Slack
            </p>
         </div>
         {EVENTS.map((e) => (
            <label
               key={e.key}
               className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
            >
               <span className="flex flex-col">
                  <span className="text-sm">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{e.hint}</span>
               </span>
               <Switch
                  checked={cfg[e.key]}
                  onCheckedChange={(v) => void toggle(e.key, v)}
                  aria-label={e.label}
               />
            </label>
         ))}
      </div>
   );
}
