'use client';

import {
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { MoreHorizontal, Star } from 'lucide-react';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

const TABS = ['overview', 'activity', 'projects'] as const;

export default function Header() {
   const { initiativeId } = useParams<{ initiativeId: string }>();
   const initiative = useWorkspaceStore((s) => s.getInitiativeById(initiativeId));
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));

   if (!initiative) return null;

   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs shrink-0">
                  {initiative.icon}
               </span>
               <HeaderTitle>{initiative.name}</HeaderTitle>
               <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
               <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
            </HeaderGroup>
         </LocationBar>
         <ViewBar className="justify-start gap-1.5">
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
         </ViewBar>
      </>
   );
}
