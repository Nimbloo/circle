'use client';

import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { CreateCycleButton } from '@/components/common/cycles/create-cycle-dialog';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Star } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function HeaderNav() {
   const { teamId } = useParams<{ teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   if (!team) return <LocationBar />;

   return (
      <LocationBar>
         <HeaderGroup className="ml-2.5">
            <HeaderTitle>Cycles</HeaderTitle>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
         </HeaderGroup>
         <HeaderActions>
            <CreateCycleButton defaultTeamId={team.id} />
         </HeaderActions>
      </LocationBar>
   );
}
