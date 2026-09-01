'use client';

import { cn } from '@/lib/utils';
import { ViewBar } from '@/components/layout/header-primitives';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { AddTeamMemberButton } from '@/components/common/teams/add-team-member-button';

const TEAM_TABS = [
   { label: 'Overview', segment: 'overview' },
   { label: 'Documents', segment: 'documents' },
   { label: 'Members', segment: 'members' },
];

export default function HeaderTabs() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const pathname = usePathname();

   return (
      <ViewBar className="pl-2 pr-2.5">
         <div className="flex translate-y-[0.5px] items-center gap-2">
            {TEAM_TABS.map((tab) => {
               const href = `/${orgId}/team/${teamId}/${tab.segment}`;
               const isActive = pathname === href;
               return (
                  <Link
                     key={tab.segment}
                     href={href}
                     className={cn(
                        'px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
                        isActive
                           ? 'bg-accent text-foreground border-border'
                           : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                     )}
                  >
                     {tab.label}
                  </Link>
               );
            })}
         </div>
         {pathname.endsWith('/members') && (
            <div className="mr-[34px] translate-y-[0.5px]">
               <AddTeamMemberButton />
            </div>
         )}
      </ViewBar>
   );
}
