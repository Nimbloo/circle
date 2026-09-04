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
import { ListSkeleton } from '@/components/common/list-skeleton';
import { api } from '@/lib/client';
import type { ApiScope, ApiTokenDto, CreatedApiTokenDto } from '@/lib/api/api-tokens';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Settings → API tokens (#101). Criar (com escopos), listar e revogar. O valor em claro
 * aparece UMA vez, num diálogo próprio depois da criação — a lista nunca o tem.
 */

const SCOPE_HELP: Record<ApiScope, string> = {
   read: 'Ler issues, projetos, times e catálogos',
   write: 'Criar e atualizar issues e projetos',
};

const SCOPES = Object.keys(SCOPE_HELP) as ApiScope[];

function formatDate(iso: string | null): string {
   return iso ? new Date(iso).toLocaleDateString() : 'nunca';
}

function CreateDialog({
   open,
   onOpenChange,
   onCreated,
}: {
   open: boolean;
   onOpenChange: (v: boolean) => void;
   onCreated: (token: CreatedApiTokenDto) => void;
}) {
   const [name, setName] = useState('');
   const [scopes, setScopes] = useState<ApiScope[]>(['read']);
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      if (open) {
         setName('');
         setScopes(['read']);
      }
   }, [open]);

   const toggle = (scope: ApiScope, on: boolean) =>
      setScopes((list) => (on ? [...new Set([...list, scope])] : list.filter((s) => s !== scope)));

   const submit = async () => {
      if (!name.trim() || scopes.length === 0 || busy) return;
      setBusy(true);
      try {
         const created = await api.apiTokens.create(name.trim(), scopes);
         onOpenChange(false);
         onCreated(created);
         toast.success('Token criado');
      } catch {
         toast.error('Não foi possível criar o token');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Novo token de API</DialogTitle>
               <DialogDescription>
                  O valor aparece uma única vez. Guarde-o num cofre de segredos.
               </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="token-name">Nome</Label>
                  <Input
                     id="token-name"
                     value={name}
                     placeholder="CI do deploy"
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-2">
                  <Label>Escopos</Label>
                  {SCOPES.map((scope) => (
                     <label key={scope} className="flex items-start gap-2.5 text-[13px]">
                        <Checkbox
                           aria-label={`Escopo ${scope}`}
                           checked={scopes.includes(scope)}
                           onCheckedChange={(v) => toggle(scope, v === true)}
                        />
                        <span>
                           <span className="font-medium">{scope}</span>
                           <span className="ml-1.5 text-muted-foreground">{SCOPE_HELP[scope]}</span>
                        </span>
                     </label>
                  ))}
               </div>
            </div>
            <DialogFooter>
               <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
               </Button>
               <Button disabled={!name.trim() || scopes.length === 0 || busy} onClick={submit}>
                  Criar token
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Diálogo do valor em claro — a única vez em que ele existe fora do cliente HTTP. */
function RevealDialog({
   token,
   onClose,
}: {
   token: CreatedApiTokenDto | null;
   onClose: () => void;
}) {
   return (
      <Dialog open={Boolean(token)} onOpenChange={(v) => !v && onClose()}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Token criado</DialogTitle>
               <DialogDescription>
                  Copie agora: este valor não volta a ser exibido.
               </DialogDescription>
            </DialogHeader>
            <code className="block break-all rounded-[8px] bg-muted/60 p-3 text-[13px]">
               {token?.token}
            </code>
            <DialogFooter>
               <Button
                  onClick={() => {
                     if (token) void navigator.clipboard?.writeText(token.token);
                     onClose();
                  }}
               >
                  Copiar e fechar
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

export default function ApiTokensSettings() {
   const [tokens, setTokens] = useState<ApiTokenDto[]>([]);
   const [loading, setLoading] = useState(true);
   const [creating, setCreating] = useState(false);
   const [revealed, setRevealed] = useState<CreatedApiTokenDto | null>(null);
   const [revoking, setRevoking] = useState<ApiTokenDto | null>(null);

   useEffect(() => {
      let alive = true;
      api.apiTokens
         .list()
         .then((list) => alive && setTokens(list))
         .catch(() => alive && toast.error('Não foi possível carregar os tokens'))
         .finally(() => alive && setLoading(false));
      return () => {
         alive = false;
      };
   }, []);

   // Otimista + rollback: a linha vira "Revogado" na hora e volta se a API recusar.
   const revoke = async (token: ApiTokenDto) => {
      const previous = tokens;
      const now = new Date().toISOString();
      setTokens((list) => list.map((t) => (t.id === token.id ? { ...t, revokedAt: now } : t)));
      setRevoking(null);
      try {
         await api.apiTokens.revoke(token.id);
         toast.success('Token revogado');
      } catch {
         setTokens(previous);
         toast.error('Não foi possível revogar o token');
      }
   };

   return (
      <>
         <SettingsShell
            title="API tokens"
            description="Credenciais da API pública em /api/public/v1. Revogar é imediato."
            action={
               <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Novo token
               </Button>
            }
         >
            <SettingsSection>
               {loading ? (
                  <ListSkeleton rows={3} />
               ) : tokens.length === 0 ? (
                  <SettingsCard>
                     <SettingsRow
                        icon={<KeyRound className="size-4" />}
                        title="Nenhum token ainda"
                        description="Crie um token para consumir a API pública."
                     />
                  </SettingsCard>
               ) : (
                  <SettingsCard>
                     {tokens.map((token) => (
                        <SettingsRow
                           key={token.id}
                           icon={<KeyRound className="size-4" />}
                           title={token.name}
                           muted={Boolean(token.revokedAt)}
                           description={
                              <span className="flex flex-wrap items-center gap-x-2">
                                 <code>{token.prefix}…</code>
                                 <span>· {token.scopes.join(', ')}</span>
                                 <span>· último uso: {formatDate(token.lastUsedAt)}</span>
                                 {token.revokedAt && <span>· revogado</span>}
                              </span>
                           }
                           trailing={
                              token.revokedAt ? (
                                 <span>Revogado</span>
                              ) : (
                                 <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Revogar ${token.name}`}
                                    onClick={() => setRevoking(token)}
                                 >
                                    <Trash2 className="size-4" />
                                 </Button>
                              )
                           }
                        />
                     ))}
                  </SettingsCard>
               )}
            </SettingsSection>
         </SettingsShell>

         <CreateDialog
            open={creating}
            onOpenChange={setCreating}
            onCreated={(token) => {
               setTokens((list) => [token, ...list]);
               setRevealed(token);
            }}
         />
         <RevealDialog token={revealed} onClose={() => setRevealed(null)} />

         <AlertDialog open={Boolean(revoking)} onOpenChange={(v) => !v && setRevoking(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Revogar “{revoking?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Quem usa este token passa a receber 401 na próxima chamada.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revoking && void revoke(revoking)}>
                     Revogar
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
