'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Link2, MoreHorizontal, Star } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function HeaderNav() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   // teams vazio (store não hidratou / 0 times) → team undefined; guarda contra crash.
   if (!team) return <LocationBar />;

   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
               {team.icon}
            </div>
            <HeaderTitle>{team.name}</HeaderTitle>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
            <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
         </HeaderGroup>
         <HeaderActions>
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
         </HeaderActions>
      </LocationBar>
   );
}
