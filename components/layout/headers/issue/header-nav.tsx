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
import { useCurrentIssueStore } from '@/store/current-issue-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   ParentIssuePickerDialog,
   useSetParent,
} from '@/components/common/issues/details/parent-issue';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import {
   Bell,
   BellOff,
   ChevronDown,
   ChevronRight,
   ChevronUp,
   CornerLeftUp,
   MoreHorizontal,
   Star,
   Copy,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
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
 * Issue page header: breadcrumb (team › cycle › [parent ›] identifier + title) and
 * previous / next navigation across the issue list. A issue atual e o pai vêm do
 * `current-issue-store` (publicado pela página, mesma fonte do detalhe) — não do
 * issues-store, que não conhece deep-links nem o pai. O store só serve à navegação
 * anterior/próxima.
 */
export default function HeaderNav() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const teams = useWorkspaceStore((s) => s.teams);
   const current = useCurrentIssueStore((s) => s.issue);
   const detail = useCurrentIssueStore((s) => s.detail);
   const setParent = useSetParent();
   const [convertOpen, setConvertOpen] = useState(false);

   const index = issues.findIndex((candidate) => candidate.identifier === issueId);
   const issue =
      current && current.identifier === issueId ? current : index >= 0 ? issues[index] : undefined;
   const parent = detail && issue && detail.identifier === issue.identifier ? detail.parent : null;
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
            {parent && (
               <>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <Link
                     href={`/${orgId}/issue/${parent.identifier}`}
                     title={parent.title}
                     data-testid="breadcrumb-parent"
                     className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                     <CornerLeftUp className="size-3.5" />
                     {parent.identifier}
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
                        <DropdownMenuItem onSelect={() => setConvertOpen(true)}>
                           <CornerLeftUp className="size-4" />
                           Convert to sub-issue of…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void toggleFavorite('issue', issue.id)}>
                           <Star className={cn('size-4', isFavorite && 'fill-current')} />
                           {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>
                  <ParentIssuePickerDialog
                     open={convertOpen}
                     onOpenChange={setConvertOpen}
                     issueId={issue.id}
                     onSelect={async (newParent) => {
                        if (await setParent(issue.id, newParent.id)) {
                           toast.success(`Now a sub-issue of ${newParent.identifier}`);
                           // A página escuta este evento e refaz o detail (breadcrumb + Parent).
                           window.dispatchEvent(
                              new CustomEvent(ISSUE_CHANGED_EVENT, { detail: { id: issue.id } })
                           );
                        }
                     }}
                  />
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
