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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useInitiativeDetailsStore } from '@/store/initiative-details-store';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

const TABS = ['overview', 'activity', 'projects'] as const;

export default function Header() {
   const { initiativeId } = useParams<{ initiativeId: string }>();
   const initiative = useWorkspaceStore((s) => s.getInitiativeById(initiativeId));
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));
   const detailsOpen = useInitiativeDetailsStore((state) => state.open);
   const toggleDetails = useInitiativeDetailsStore((state) => state.toggle);

   if (!initiative) return null;

   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs shrink-0">
                  <InitiativeGlyph icon={initiative.icon} color={initiative.iconColor} />
               </span>
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
            <Button
               type="button"
               size="icon"
               variant="ghost"
               className="hidden size-7 xl:inline-flex"
               onClick={toggleDetails}
               aria-label={detailsOpen ? 'Close Initiative details' : 'Open Initiative details'}
               aria-expanded={detailsOpen}
            >
               {detailsOpen ? (
                  <PanelRightClose className="size-4" />
               ) : (
                  <PanelRightOpen className="size-4" />
               )}
            </Button>
         </ViewBar>
      </>
   );
}
