'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { DetailPanelToggle } from '@/components/common/detail-side-panel';
import { HeaderActions, HeaderGroup, LocationBar } from '@/components/layout/header-primitives';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useFavoritesStore } from '@/store/favorites-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   Bell,
   BellOff,
   ChevronDown,
   ChevronRight,
   ChevronUp,
   MoreHorizontal,
   Star,
   Copy,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

async function copyToClipboard(value: string, successMessage: string) {
   try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
   } catch {
      toast.error('Não foi possível copiar');
   }
}

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
   const subscribed = useWorkspaceStore((s) =>
      issue ? (s.me?.subscribedIssueIds.includes(issue.id) ?? false) : false
   );
   const toggleSubscription = useWorkspaceStore((s) => s.toggleSubscription);
   const isFavorite = useFavoritesStore((state) =>
      issue ? state.isFavorite('issue', issue.id) : false
   );
   const toggleFavorite = useFavoritesStore((state) => state.toggle);
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
            {issue && (
               <>
                  <Button
                     type="button"
                     size="icon"
                     variant="ghost"
                     className="size-7 shrink-0"
                     onClick={() => void toggleFavorite('issue', issue.id)}
                     aria-label={isFavorite ? 'Unfavorite issue' : 'Favorite issue'}
                     aria-pressed={isFavorite}
                  >
                     <Star className={cn('size-4', isFavorite && 'fill-current text-primary')} />
                  </Button>
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button
                           type="button"
                           size="icon"
                           variant="ghost"
                           className="size-7 shrink-0"
                           aria-label="Issue actions"
                        >
                           <MoreHorizontal className="size-4" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem
                           onSelect={() => {
                              void copyToClipboard(window.location.href, 'Link copiado');
                           }}
                        >
                           <Copy className="size-4" />
                           Copy link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onSelect={() => {
                              void copyToClipboard(issue.identifier, 'ID copiado');
                           }}
                        >
                           <Copy className="size-4" />
                           Copy ID
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onSelect={() => {
                              void copyToClipboard(issue.title, 'Título copiado');
                           }}
                        >
                           <Copy className="size-4" />
                           Copy title
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void toggleFavorite('issue', issue.id)}>
                           <Star className={cn('size-4', isFavorite && 'fill-current')} />
                           {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>
               </>
            )}
         </HeaderGroup>

         <HeaderActions>
            {issue && (
               <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => toggleSubscription(issue.id)}
                  aria-label={subscribed ? 'Unsubscribe' : 'Subscribe'}
                  aria-pressed={subscribed}
               >
                  {subscribed ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
               </Button>
            )}
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
               aria-label="Previous issue"
            >
               {previousIssue ? (
                  <Link href={`/${orgId}/issue/${previousIssue.identifier}`}>
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
               aria-label="Next issue"
            >
               {nextIssue ? (
                  <Link href={`/${orgId}/issue/${nextIssue.identifier}`}>
                     <ChevronDown className="size-4" />
                  </Link>
               ) : (
                  <ChevronDown className="size-4" />
               )}
            </Button>
            <DetailPanelToggle kind="issue" />
         </HeaderActions>
      </LocationBar>
   );
}
