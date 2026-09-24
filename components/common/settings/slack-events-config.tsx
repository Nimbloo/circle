'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/client';
import { errorReason } from '@/lib/error-reason';
import { SettingsCard } from './shared';
import type { SlackConfigDto } from '@/lib/api/integrations/slack';
import { useCallback, useEffect, useRef, useState } from 'react';
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
   // Falha na carga era engolida e a seção sumia (`!cfg`): agora vira erro com retry.
   const [loadFailed, setLoadFailed] = useState(false);
   const alive = useRef(true);

   const load = useCallback(() => {
      setLoadFailed(false);
      void api.integrations
         .slackConfig()
         .then((c) => alive.current && setCfg(c))
         .catch(() => alive.current && setLoadFailed(true));
   }, []);

   useEffect(() => {
      alive.current = true;
      load();
      return () => {
         alive.current = false;
      };
   }, [load]);

   // Otimista e reconciliado POR CAMPO (Ad#36): a resposta ou o revert de um toggle não
   // desfaz outro toggle em voo.
   const toggle = async (key: keyof SlackConfigDto, value: boolean) => {
      if (!cfg) return;
      const prev = cfg[key];
      setCfg((c) => (c ? { ...c, [key]: value } : c));
      try {
         const next = await api.integrations.updateSlackConfig({ [key]: value });
         setCfg((c) => (c ? { ...c, [key]: next[key] } : next));
      } catch (err) {
         // Só reverte se o campo ainda mostra o valor otimista deste toggle.
         setCfg((c) => (c && c[key] === value ? { ...c, [key]: prev } : c));
         // Só o 403 é "não é admin"; o resto (5xx, rede, 4xx) mostra o motivo real.
         toast.error(
            (err as { status?: unknown })?.status === 403
               ? 'Só admin pode mudar as notificações do Slack'
               : errorReason(err, 'Não foi possível salvar as notificações do Slack')
         );
      }
   };

   if (loadFailed)
      return (
         <SettingsCard>
            <div
               role="alert"
               className="flex flex-col items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            >
               Não foi possível carregar as notificações do Slack.
               <Button size="sm" variant="outline" onClick={load}>
                  Tentar novamente
               </Button>
            </div>
         </SettingsCard>
      );

   if (!cfg) return null;

   return (
      <SettingsCard>
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
      </SettingsCard>
   );
}
