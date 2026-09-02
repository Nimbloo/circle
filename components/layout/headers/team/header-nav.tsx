'use client';

import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Link2, MoreHorizontal, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

async function copyTeamUrl(orgId: string, teamId: string) {
   try {
      await navigator.clipboard.writeText(
         `${window.location.origin}/${orgId}/team/${teamId}/overview`
      );
      toast.success('Link copiado');
   } catch {
      toast.error('Não foi possível copiar');
   }
}

export default function HeaderNav() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   // teams vazio (store não hidratou / 0 times) → team undefined; guarda contra crash.
   if (!team) return <LocationBar />;

   return (
      <LocationBar>
         <HeaderGroup className="pl-2.5">
            <div className="inline-flex size-4 bg-muted/50 items-center justify-center rounded shrink-0 text-[10px]">
               {team.icon}
            </div>
            <HeaderTitle>{team.name}</HeaderTitle>
         </HeaderGroup>
         <HeaderActions className="pr-0.5">
            <Button
               type="button"
               size="icon"
               variant="ghost"
               className="size-7"
               aria-label="Copy team URL"
               onClick={() => {
                  void copyTeamUrl(orgId, team.id);
               }}
            >
               <Link2 className="size-4" />
            </Button>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     type="button"
                     size="icon"
                     variant="ghost"
                     className="size-7"
                     aria-label="Team actions"
                  >
                     <MoreHorizontal className="size-4" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                     <Link href={`/${orgId}/settings/teams/${team.id}`}>
                        <Settings className="size-4" />
                        Team settings
                     </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                     onSelect={() => {
                        void copyTeamUrl(orgId, team.id);
                     }}
                  >
                     <Link2 className="size-4" />
                     Copy link
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </HeaderActions>
      </LocationBar>
   );
}
