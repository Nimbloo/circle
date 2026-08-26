'use client';

import { api } from '@/lib/client';
import { Team } from '@/data/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Box, Copy, IterationCcw, Link2, ListTodo, Trash2, Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Primitivos de menu (Context OU Dropdown) para um team. Igual ao padrão de
 * `IssueMenuItems`: ContextMenu e DropdownMenu do shadcn compartilham a mesma API,
 * então a MESMA árvore de itens é renderizada no right-click do team (sidebar/lista),
 * no ⋯ do header do time e no ⋯ do sidebar — todos idênticos e cablados.
 * Só expõe ações com backend real (navegação + copy link + delete); nada simulado.
 */
export interface TeamMenuPrimitives {
   Item: React.ElementType;
   Separator: React.ElementType;
   Shortcut: React.ElementType;
}

interface TeamMenuItemsProps {
   team: Team;
   primitives: TeamMenuPrimitives;
   /** Chamado quando o usuário pede Delete — o wrapper abre o AlertDialog. */
   onRequestDelete: () => void;
}

export function TeamMenuItems({ team, primitives: P, onRequestDelete }: TeamMenuItemsProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();

   const go = (segment: string) => router.push(`/${orgId}/team/${team.id}/${segment}`);

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/team/${team.id}/overview`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
   };

   return (
      <>
         <P.Item onSelect={() => go('all')}>
            <ListTodo className="size-4" />
            Issues
         </P.Item>
         <P.Item onSelect={() => go('projects')}>
            <Box className="size-4" />
            Projects
         </P.Item>
         <P.Item onSelect={() => go('cycles')}>
            <IterationCcw className="size-4" />
            Cycles
         </P.Item>
         <P.Item onSelect={() => go('members')}>
            <Users className="size-4" />
            Members
         </P.Item>
         <P.Separator />
         <P.Item onSelect={copyLink}>
            <Link2 className="size-4" />
            Copy link
            <P.Shortcut>
               <Copy className="size-3.5" />
            </P.Shortcut>
         </P.Item>
         <P.Separator />
         <P.Item variant="destructive" onSelect={onRequestDelete}>
            <Trash2 className="size-4" />
            Delete team
         </P.Item>
      </>
   );
}

/** Handler de delete reutilizável (persiste via `api.teams.remove` + re-hidrata). */
export function useTeamDelete(team: Team, onDone?: () => void) {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   return async () => {
      try {
         await api.teams.remove(team.id);
         await hydrate();
         toast.success('Team deleted');
         onDone?.();
      } catch {
         toast.error('Não foi possível excluir o time (ainda tem issues/projects/cycles?)');
      }
   };
}
