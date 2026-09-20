'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
import { api, ApiError } from '@/lib/client';
import type { AuditLogDto } from '@/lib/api/audit';
import { useWorkspaceStore } from '@/store/workspace-store';
import { SettingsShell } from './shared';

/**
 * Rótulos legíveis das ações registradas. Chave desconhecida cai no próprio código
 * (o audit log é append-only e pode ganhar ações novas antes desta tela).
 */
export const ACTION_LABELS: Record<string, string> = {
   'team.create': 'criou um time',
   'team.delete': 'excluiu um time',
   'member.add': 'adicionou um membro ao time',
   'member.remove': 'removeu um membro do time',
   'member.deactivate': 'desativou um membro',
   'member.reactivate': 'reativou um membro',
   'invite.create': 'convidou uma pessoa',
   'invite.revoke': 'revogou um convite',
   'webhook.create': 'criou um webhook',
   'webhook.delete': 'excluiu um webhook',
   'automation.run': 'executou uma automação',
};

function formatWhen(iso: string): string {
   const d = new Date(iso);
   return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/** `{ email: "x" }` -> `email: x` — meta é livre, então renderiza chave/valor cru. */
function formatMeta(meta: Record<string, unknown> | null): string | null {
   if (!meta) return null;
   const parts = Object.entries(meta)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${String(v)}`);
   return parts.length ? parts.join(' · ') : null;
}

/**
 * Workspace → "Audit log": ações administrativas, mais recente primeiro. Só admin —
 * a rota devolve 403 para os demais, e a tela reflete isso em vez de ficar vazia.
 */
export default function AuditLogSettings() {
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const [entries, setEntries] = useState<AuditLogDto[] | null>(null);
   const [denied, setDenied] = useState(false);
   const [failed, setFailed] = useState(false);
   const seq = useRef(0);

   const load = useCallback(() => {
      const mine = ++seq.current;
      setFailed(false);
      setEntries(null);
      api.audit()
         .then((rows) => {
            if (mine === seq.current) setEntries(rows);
         })
         .catch((e) => {
            if (mine !== seq.current) return;
            // Erro de carga não é "nenhuma ação" (Ad#22): mostra o erro com retry.
            if (e instanceof ApiError && e.status === 403) setDenied(true);
            else setFailed(true);
         });
   }, []);

   useEffect(load, [load]);

   return (
      <SettingsShell
         title="Audit log"
         description="Ações administrativas do workspace, mais recentes primeiro. Somente admins."
      >
         {denied || !isAdmin ? (
            <p className="text-sm text-muted-foreground">
               Só administradores do workspace podem ver o audit log.
            </p>
         ) : failed ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
               Não foi possível carregar o audit log.
               <Button size="sm" variant="outline" onClick={load}>
                  Tentar novamente
               </Button>
            </div>
         ) : entries === null ? (
            <LoadingArea rows={6} />
         ) : entries.length === 0 ? (
            <EmptyState
               variant="activity"
               title="Nenhuma ação registrada ainda"
               className="py-10"
            />
         ) : (
            <div className="content-enter rounded-lg border bg-container overflow-hidden divide-y divide-border/60">
               {entries.map((e) => {
                  const meta = formatMeta(e.meta);
                  return (
                     <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                        <Avatar className="size-6 shrink-0 mt-0.5">
                           <AvatarImage
                              src={e.actor?.avatarUrl || undefined}
                              alt={e.actor?.name ?? ''}
                           />
                           <AvatarFallback className="text-[10px]">
                              {e.actor?.name?.[0] ?? '?'}
                           </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                           <p className="text-sm">
                              <span className="font-medium">{e.actor?.name ?? 'Sistema'}</span>{' '}
                              <span className="text-muted-foreground">
                                 {ACTION_LABELS[e.action] ?? e.action}
                              </span>
                              {e.targetType && (
                                 <span className="text-muted-foreground">
                                    {' '}
                                    ({e.targetType}
                                    {e.targetId ? ` ${e.targetId}` : ''})
                                 </span>
                              )}
                           </p>
                           {meta && (
                              <p className="text-xs text-muted-foreground truncate">{meta}</p>
                           )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                           {formatWhen(e.createdAt)}
                        </span>
                     </div>
                  );
               })}
            </div>
         )}
      </SettingsShell>
   );
}
