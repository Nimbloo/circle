'use client';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { api } from '@/lib/client';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/api/webhook-events';
import type { WebhookDeliveryDto, WebhookDto } from '@/lib/api/webhooks';
import { cn } from '@/lib/utils';
import { Plus, RefreshCw, Trash2, Webhook } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Settings → Webhooks (#101): criar, escolher eventos, ligar/desligar, ver as últimas
 * entregas e reenviar (Redeliver). Padrão Linear: linha com toggle à direita e o detalhe
 * de entregas expandindo abaixo.
 */

/** Cor do status da entrega — só tokens, funciona em light e dark. */
const STATUS_CLASS: Record<string, string> = {
   success: 'text-[var(--online-indicator)]',
   failed: 'text-warning',
   exhausted: 'text-destructive',
   pending: 'text-muted-foreground',
};

function CreateDialog({
   open,
   onOpenChange,
   onCreated,
}: {
   open: boolean;
   onOpenChange: (v: boolean) => void;
   onCreated: (hook: WebhookDto) => void;
}) {
   const [url, setUrl] = useState('');
   const [events, setEvents] = useState<WebhookEvent[]>(['issue.created']);
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      if (open) {
         setUrl('');
         setEvents(['issue.created']);
      }
   }, [open]);

   const toggle = (event: WebhookEvent, on: boolean) =>
      setEvents((list) => (on ? [...new Set([...list, event])] : list.filter((e) => e !== event)));

   const submit = async () => {
      if (!url.trim() || events.length === 0 || busy) return;
      setBusy(true);
      try {
         const created = await api.webhooks.create({ url: url.trim(), events });
         onOpenChange(false);
         onCreated(created);
         toast.success('Webhook criado');
      } catch {
         toast.error('Não foi possível criar o webhook (URL válida?)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Novo webhook</DialogTitle>
               <DialogDescription>
                  Cada entrega vai assinada em `X-Circle-Signature` (HMAC-SHA256 do corpo).
               </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="webhook-url">URL de destino</Label>
                  <Input
                     id="webhook-url"
                     value={url}
                     placeholder="https://exemplo.com/circle"
                     onChange={(e) => setUrl(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-2">
                  <Label>Eventos</Label>
                  {WEBHOOK_EVENTS.map((event) => (
                     <label key={event} className="flex items-center gap-2.5 text-[13px]">
                        <Checkbox
                           aria-label={`Evento ${event}`}
                           checked={events.includes(event)}
                           onCheckedChange={(v) => toggle(event, v === true)}
                        />
                        <code>{event}</code>
                     </label>
                  ))}
               </div>
            </div>
            <DialogFooter>
               <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
               </Button>
               <Button disabled={!url.trim() || events.length === 0 || busy} onClick={submit}>
                  Criar webhook
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Lista das últimas entregas do webhook, com Redeliver por linha. */
function Deliveries({ webhookId }: { webhookId: string }) {
   const [items, setItems] = useState<WebhookDeliveryDto[] | null>(null);
   const [busyId, setBusyId] = useState<string | null>(null);

   const load = useCallback(() => {
      api.webhooks
         .deliveries(webhookId)
         .then(setItems)
         .catch(() => toast.error('Não foi possível carregar as entregas'));
   }, [webhookId]);

   useEffect(load, [load]);

   const redeliver = async (delivery: WebhookDeliveryDto) => {
      setBusyId(delivery.id);
      try {
         const updated = await api.webhooks.redeliver(delivery.id);
         setItems((list) => list?.map((d) => (d.id === updated.id ? updated : d)) ?? null);
         toast.success(updated.status === 'success' ? 'Reenviado' : 'Reenvio falhou de novo');
      } catch {
         toast.error('Não foi possível reenviar');
      } finally {
         setBusyId(null);
      }
   };

   if (!items)
      return <div className="px-4 py-3 text-[13px] text-muted-foreground">Carregando…</div>;
   if (items.length === 0)
      return (
         <div className="px-4 py-3 text-[13px] text-muted-foreground">Nenhuma entrega ainda.</div>
      );

   return (
      <ul className="divide-y divide-border/60">
         {items.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
               <code className="min-w-0 flex-1 truncate text-muted-foreground">{d.event}</code>
               <span className={cn('shrink-0', STATUS_CLASS[d.status])}>{d.status}</span>
               <span className="w-24 shrink-0 text-right text-muted-foreground">
                  {d.responseCode ?? d.lastError ?? '—'}
               </span>
               <span className="w-16 shrink-0 text-right text-muted-foreground">{d.attempts}x</span>
               <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === d.id}
                  aria-label={`Reenviar entrega ${d.id}`}
                  onClick={() => void redeliver(d)}
               >
                  <RefreshCw className="size-3.5" />
                  Redeliver
               </Button>
            </li>
         ))}
      </ul>
   );
}

export default function WebhooksSettings() {
   const [hooks, setHooks] = useState<WebhookDto[]>([]);
   const [loading, setLoading] = useState(true);
   const [creating, setCreating] = useState(false);
   const [secret, setSecret] = useState<string | null>(null);
   const [expanded, setExpanded] = useState<string | null>(null);
   const [removing, setRemoving] = useState<WebhookDto | null>(null);

   useEffect(() => {
      let alive = true;
      api.webhooks
         .list()
         .then((list) => alive && setHooks(list))
         .catch(() => alive && toast.error('Não foi possível carregar os webhooks'))
         .finally(() => alive && setLoading(false));
      return () => {
         alive = false;
      };
   }, []);

   // Otimista + rollback (o toggle reflete na hora; volta atrás se a API recusar).
   const toggle = async (hook: WebhookDto, enabled: boolean) => {
      setHooks((list) => list.map((h) => (h.id === hook.id ? { ...h, enabled } : h)));
      try {
         const dto = await api.webhooks.update(hook.id, { enabled });
         setHooks((list) => list.map((h) => (h.id === dto.id ? dto : h)));
         toast.success(enabled ? 'Webhook ativado' : 'Webhook desativado');
      } catch {
         setHooks((list) => list.map((h) => (h.id === hook.id ? hook : h)));
         toast.error('Não foi possível atualizar o webhook');
      }
   };

   const remove = async (hook: WebhookDto) => {
      const previous = hooks;
      setHooks((list) => list.filter((h) => h.id !== hook.id));
      setRemoving(null);
      try {
         await api.webhooks.remove(hook.id);
         toast.success('Webhook excluído');
      } catch {
         setHooks(previous);
         toast.error('Não foi possível excluir o webhook');
      }
   };

   return (
      <>
         <SettingsShell
            title="Webhooks"
            description="Receba os eventos do Circle no seu serviço, com assinatura HMAC e retry automático."
            action={
               <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Novo webhook
               </Button>
            }
         >
            <SettingsSection>
               {loading ? (
                  <ListSkeleton rows={3} />
               ) : hooks.length === 0 ? (
                  <SettingsCard>
                     <SettingsRow
                        icon={<Webhook className="size-4" />}
                        title="Nenhum webhook ainda"
                        description="Crie um para receber issue.created, project.updated e afins."
                     />
                  </SettingsCard>
               ) : (
                  hooks.map((hook) => (
                     <SettingsCard key={hook.id}>
                        <SettingsRow
                           icon={<Webhook className="size-4" />}
                           title={hook.url}
                           muted={!hook.enabled}
                           description={hook.events.join(', ')}
                           trailing={
                              <div className="flex items-center gap-2">
                                 <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                       setExpanded((id) => (id === hook.id ? null : hook.id))
                                    }
                                 >
                                    {expanded === hook.id ? 'Ocultar entregas' : 'Entregas'}
                                 </Button>
                                 <Switch
                                    aria-label={`Ativar ${hook.url}`}
                                    checked={hook.enabled}
                                    onCheckedChange={(v) => void toggle(hook, v)}
                                 />
                                 <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Excluir ${hook.url}`}
                                    onClick={() => setRemoving(hook)}
                                 >
                                    <Trash2 className="size-4" />
                                 </Button>
                              </div>
                           }
                        />
                        {expanded === hook.id && <Deliveries webhookId={hook.id} />}
                     </SettingsCard>
                  ))
               )}
            </SettingsSection>
         </SettingsShell>

         <CreateDialog
            open={creating}
            onOpenChange={setCreating}
            onCreated={(hook) => {
               setHooks((list) => [hook, ...list]);
               if (hook.secret) setSecret(hook.secret);
            }}
         />

         <Dialog open={Boolean(secret)} onOpenChange={(v) => !v && setSecret(null)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Segredo de assinatura</DialogTitle>
                  <DialogDescription>
                     Configure-o no receptor para validar o header `X-Circle-Signature`. Ele não
                     volta a ser exibido.
                  </DialogDescription>
               </DialogHeader>
               <code className="block break-all rounded-[8px] bg-muted/60 p-3 text-[13px]">
                  {secret}
               </code>
               <DialogFooter>
                  <Button
                     onClick={() => {
                        if (secret) void navigator.clipboard?.writeText(secret);
                        setSecret(null);
                     }}
                  >
                     Copiar e fechar
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <AlertDialog open={Boolean(removing)} onOpenChange={(v) => !v && setRemoving(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir este webhook?</AlertDialogTitle>
                  <AlertDialogDescription>
                     As entregas registradas também somem. A ação não pode ser desfeita.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removing && void remove(removing)}>
                     Excluir
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
