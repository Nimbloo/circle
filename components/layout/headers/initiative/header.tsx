'use client';

import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { InitiativeActions } from '@/components/common/initiatives/initiative-actions';
import { InitiativeGlyph } from '@/components/common/initiatives/initiative-glyph';
import { DetailPanelToggle } from '@/components/common/detail-side-panel';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { initiativeBreadcrumb } from '@/lib/initiative-tree';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

const TABS = ['overview', 'activity', 'projects'] as const;

export default function Header() {
   const { orgId, initiativeId } = useParams<{ orgId: string; initiativeId: string }>();
   const initiative = useWorkspaceStore((s) => s.getInitiativeById(initiativeId));
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));

   if (!initiative) return null;

   // Sub-initiatives (#100): breadcrumb "Mãe › Filha" com as ancestrais clicáveis.
   const ancestors = initiativeBreadcrumb(initiatives, initiative.id).slice(0, -1);

   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs shrink-0">
                  <InitiativeGlyph icon={initiative.icon} color={initiative.iconColor} />
               </span>
               {ancestors.map((ancestor) => (
                  <span key={ancestor.id} className="flex items-center gap-1.5">
                     <Link
                        href={`/${orgId}/initiative/${ancestor.id}`}
                        className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                     >
                        {ancestor.name}
                     </Link>
                     <span className="text-muted-foreground">›</span>
                  </span>
               ))}
               <HeaderTitle>{initiative.name}</HeaderTitle>
            </HeaderGroup>
            <HeaderActions>
               <InitiativeActions initiative={initiative} />
            </HeaderActions>
         </LocationBar>
         <ViewBar>
            <div className="flex items-center gap-1.5">
               {TABS.map((candidate) => (
                  <button
                     key={candidate}
                     onClick={() => setTab(candidate)}
                     className={cn(
                        'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium capitalize transition-colors',
                        tab === candidate
                           ? 'bg-accent border-transparent'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {candidate}
                  </button>
               ))}
            </div>
            <DetailPanelToggle kind="initiative" />
         </ViewBar>
      </>
   );
}
