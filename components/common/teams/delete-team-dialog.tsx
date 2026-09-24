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
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingArea } from '@/components/common/loading-area';
import { useAsyncResource } from '@/hooks/use-async-resource';
import { api } from '@/lib/client';
import type { TeamDeletionImpact } from '@/lib/api/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   Box,
   FileText,
   Folder,
   IterationCcw,
   Layers,
   ListTodo,
   type LucideIcon,
} from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorReason } from '@/lib/error-reason';
import { landingHref } from '@/lib/landing';

const IMPACT_ROWS: {
   key: keyof TeamDeletionImpact;
   one: string;
   many: string;
   icon: LucideIcon;
}[] = [
   { key: 'issues', one: 'issue', many: 'issues', icon: ListTodo },
   { key: 'projects', one: 'projeto', many: 'projetos', icon: Box },
   { key: 'cycles', one: 'ciclo', many: 'ciclos', icon: IterationCcw },
   { key: 'views', one: 'view', many: 'views', icon: Layers },
   { key: 'folders', one: 'pasta de documentos', many: 'pastas de documentos', icon: Folder },
   { key: 'documents', one: 'documento', many: 'documentos', icon: FileText },
];

/** "12 issues", "1 projeto"… só do que o time tem; vazio = time sem conteúdo. */
export function describeDeletionImpact(impact: TeamDeletionImpact) {
   return IMPACT_ROWS.filter((row) => impact[row.key] > 0).map((row) => ({
      key: row.key,
      icon: row.icon,
      label: `${impact[row.key]} ${impact[row.key] === 1 ? row.one : row.many}`,
   }));
}

/**
 * Exclusão de time (paridade Linear): mostra o que será apagado junto (buscado ao abrir)
 * e exige digitar o nome do time. A exclusão é em cascata no servidor; o store só perde
 * o time e o conteúdo dele depois que a API confirma.
 */
export function DeleteTeamDialog({
   team,
   open,
   onOpenChange,
}: {
   team: { id: string; name: string };
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const router = useRouter();
   const removeTeamLocal = useWorkspaceStore((s) => s.removeTeamLocal);
   const [confirmName, setConfirmName] = useState('');
   const [busy, setBusy] = useState(false);
   const impact = useAsyncResource(open ? team.id : null, (id) => api.teams.deletionImpact(id));

   useEffect(() => {
      if (open) setConfirmName('');
   }, [open]);

   // Time com nome em branco (dado legado) confirma pelo IDENTIFICADOR: comparar com um
   // nome vazio soltava o botão com o campo vazio (ad#2).
   const expectedName = team.name.trim() || team.id;
   const canDelete = !busy && !!impact.data && confirmName.trim() === expectedName;

   const remove = async () => {
      if (!canDelete) return;
      setBusy(true);
      try {
         await api.teams.remove(team.id);
         removeTeamLocal(team.id);
         toast.success('Time excluído');
         onOpenChange(false);
         // A tela atual era do time (issues, projetos, ciclos, settings): sai dela.
         const base = `/${orgId}`;
         const onTeamScreen =
            pathname?.startsWith(`${base}/team/${team.id}/`) ||
            pathname === `${base}/team/${team.id}` ||
            pathname?.startsWith(`${base}/settings/teams/${team.id}`);
         if (onTeamScreen) router.push(landingHref(orgId));
      } catch (e) {
         toast.error(errorReason(e, 'Não foi possível excluir o time'));
      } finally {
         setBusy(false);
      }
   };

   const rows = impact.data ? describeDeletionImpact(impact.data) : [];

   return (
      <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Excluir “{team.name}”?</AlertDialogTitle>
               <AlertDialogDescription>
                  O time e todo o conteúdo dele serão excluídos permanentemente. Esta ação não pode
                  ser desfeita.
               </AlertDialogDescription>
            </AlertDialogHeader>

            {impact.loading ? (
               <LoadingArea rows={2} size="sm" label="Verificando o conteúdo do time…" />
            ) : impact.error ? (
               // Sem o impacto o botão de excluir não destrava: o erro precisa de retry.
               <div role="alert" className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-destructive">
                     {errorReason(impact.error, 'Não foi possível verificar o conteúdo do time')}
                  </p>
                  <Button size="xs" variant="outline" onClick={() => void impact.reload()}>
                     Tentar novamente
                  </Button>
               </div>
            ) : rows.length > 0 ? (
               <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                  <p className="mb-1.5 text-xs text-muted-foreground">Também serão excluídos:</p>
                  <ul aria-label="Conteúdo que será excluído" className="flex flex-col gap-1">
                     {rows.map(({ key, icon: Icon, label }) => (
                        <li key={key} className="flex items-center gap-2 text-[13px]">
                           <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                           {label}
                        </li>
                     ))}
                  </ul>
               </div>
            ) : (
               <p className="text-[13px] text-muted-foreground">
                  O time não tem conteúdo; só a configuração dele será removida.
               </p>
            )}

            <div className="flex flex-col gap-1.5">
               <label htmlFor="delete-team-confirm" className="text-xs text-muted-foreground">
                  Digite <span className="font-medium text-foreground">{expectedName}</span> para
                  confirmar
               </label>
               <Input
                  id="delete-team-confirm"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                        e.preventDefault();
                        void remove();
                     }
                  }}
                  placeholder={expectedName}
                  autoComplete="off"
                  autoFocus
               />
            </div>

            <AlertDialogFooter>
               <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
               <AlertDialogAction
                  onClick={(e) => {
                     e.preventDefault();
                     void remove();
                  }}
                  disabled={!canDelete}
                  className={buttonVariants({ variant: 'destructive' })}
               >
                  {busy ? 'Excluindo…' : 'Excluir time'}
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}
