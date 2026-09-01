'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { HeaderActions, HeaderGroup, LocationBar } from '@/components/layout/header-primitives';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Issue page header: breadcrumb (team › cycle › identifier + title) and
 * previous / next navigation across the issue list.
 */
export default function HeaderNav() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const teams = useWorkspaceStore((s) => s.teams);

   const index = issues.findIndex((candidate) => candidate.identifier === issueId);
   const issue = index >= 0 ? issues[index] : undefined;
   // time real da issue (fallback p/ o 1º só enquanto o workspace ainda hidrata)
   const team = teams.find((t) => t.id === issue?.teamId) ?? teams[0];
   const cycle = useWorkspaceStore((s) =>
      issue?.cycleId ? s.getCycleById(issue.cycleId) : undefined
   );

   const previousIssue = index > 0 ? issues[index - 1] : undefined;
   const nextIssue = index >= 0 && index < issues.length - 1 ? issues[index + 1] : undefined;

   // Workspace ainda sem times (bootstrap vazio/carregando) — sem breadcrumb a montar.
   if (!team) return null;

   return (
      <LocationBar className="gap-4">
         <HeaderGroup>
            <SidebarTrigger />
            <Link
               href={`/${orgId}/team/${team.id}/overview`}
               className="flex shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
               <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                  {team.icon}
               </div>
               <span className="hidden text-[13px] md:inline">{team.name}</span>
            </Link>
            {cycle && (
               <>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <Link
                     href={`/${orgId}/team/${team.id}/cycles`}
                     className="hidden shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground sm:flex"
                  >
                     <CyclePlayIcon className="size-3.5" />
                     {cycle.name}
                  </Link>
               </>
            )}
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            {issue && (
               <span className="min-w-0 truncate text-[13px]">
                  <span className="font-medium text-muted-foreground mr-1.5">
                     {issue.identifier}
                  </span>
                  <span className="font-medium">{issue.title}</span>
               </span>
            )}
            <Star className="size-3.5 text-muted-foreground shrink-0" />
            <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
         </HeaderGroup>

         <HeaderActions>
            {index >= 0 && (
               <span className="text-xs text-muted-foreground mr-1">
                  {index + 1} / {issues.length}
               </span>
            )}
            <Button
               variant="ghost"
               size="icon"
               className="size-6"
               disabled={!previousIssue}
               asChild={!!previousIssue}
            >
               {previousIssue ? (
                  <Link
                     href={`/${orgId}/issue/${previousIssue.identifier}`}
                     aria-label="Previous issue"
                  >
                     <ChevronUp className="size-4" />
                  </Link>
               ) : (
                  <ChevronUp className="size-4" />
               )}
            </Button>
            <Button
               variant="ghost"
               size="icon"
               className="size-6"
               disabled={!nextIssue}
               asChild={!!nextIssue}
            >
               {nextIssue ? (
                  <Link href={`/${orgId}/issue/${nextIssue.identifier}`} aria-label="Next issue">
                     <ChevronDown className="size-4" />
                  </Link>
               ) : (
                  <ChevronDown className="size-4" />
               )}
            </Button>
         </HeaderActions>
      </LocationBar>
   );
}
