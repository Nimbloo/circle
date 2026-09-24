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
import {
   issueNeighbors,
   navDirectionOf,
   useIssueNavigationStore,
} from '@/store/issue-navigation-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   ParentIssuePickerDialog,
   useSetParent,
} from '@/components/common/issues/details/parent-issue';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { deleteIssuesWithUndo } from '@/components/common/issues/delete-with-undo';
import { useIssueDeleteShortcut } from '@/components/common/issues/use-issue-delete-shortcut';
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
   Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
 * issues-store, que não conhece deep-links nem o pai. Anterior/próxima seguem a lista
 * de origem (`issue-navigation-store`).
 */
export default function HeaderNav() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   // `find` dentro do seletor: evento de outra issue não re-renderiza o header.
   const storeIssue = useIssuesStore((s) =>
      s.issues.find((candidate) => candidate.identifier === issueId)
   );
   const teams = useWorkspaceStore((s) => s.teams);
   const current = useCurrentIssueStore((s) => s.issue);
   const detail = useCurrentIssueStore((s) => s.detail);
   const setParent = useSetParent();
   const [convertOpen, setConvertOpen] = useState(false);

   const issue = current && current.identifier === issueId ? current : storeIssue;
   const parent = detail && issue && detail.identifier === issue.identifier ? detail.parent : null;
   const subscribed = useWorkspaceStore((s) =>
      issue ? (s.me?.subscribedIssueIds.includes(issue.id) ?? false) : false
   );
   const router = useRouter();
   // Depois de excluir a issue aberta, sai dela (a página ficaria sobre uma issue apagada).
   const leaveDeletedIssue = () => {
      if (issue) router.push(`/${orgId}/team/${issue.teamId}/all`);
   };
   // Exclui pela issue do contexto: aberta por deep-link frio, ela não está no store.
   const deleteCurrent = () => {
      if (issue && deleteIssuesWithUndo([issue.id], { fallback: [issue] })) leaveDeletedIssue();
   };
   // ⌘⌫ exclui a issue aberta (is#16).
   useIssueDeleteShortcut(issue?.id, {
      contextIssue: issue,
      onContextDeleted: leaveDeletedIssue,
   });
   const toggleSubscription = useWorkspaceStore((s) => s.toggleSubscription);
   const ensureSubscriptionKnown = useWorkspaceStore((s) => s.ensureSubscriptionKnown);
   // Issue fechada não vem nas assinaturas do bootstrap: consulta a dela uma vez.
   const closed = issue?.status.category === 'completed' || issue?.status.category === 'canceled';
   const issueKey = issue?.id;
   useEffect(() => {
      if (closed && issueKey) void ensureSubscriptionKnown(issueKey);
   }, [closed, issueKey, ensureSubscriptionKnown]);
   const isFavorite = useFavoritesStore((state) =>
      issue ? state.isFavorite('issue', issue.id) : false
   );
   const toggleFavorite = useFavoritesStore((state) => state.toggle);
   // time real da issue (fallback p/ o 1º só enquanto o workspace ainda hidrata)
   const team = teams.find((t) => t.id === issue?.teamId) ?? teams[0];
   const cycle = useWorkspaceStore((s) =>
      issue?.cycleId ? s.getCycleById(issue.cycleId) : undefined
   );

   // Anterior/próxima (#33): ordem da lista de ORIGEM (a que o usuário via), não a global.
   const order = useIssueNavigationStore((s) => s.order);
   const nav = issueNeighbors(order, issueId);
   const previousIssue = nav?.prev;
   const nextIssue = nav?.next;
   const previousRef = useRef<HTMLAnchorElement>(null);
   const nextRef = useRef<HTMLAnchorElement>(null);
   // J/K no detalhe: segue os mesmos links do header.
   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         const dir = navDirectionOf(e);
         if (!dir) return;
         const link = dir === 1 ? nextRef.current : previousRef.current;
         if (!link) return;
         e.preventDefault();
         link.click();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, []);

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
               // Chevron e link escondem juntos abaixo de sm (is#18): separados, o link some
               // e sobra um "›" órfão no breadcrumb mobile (`E › ›`).
               <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <Link
                     href={`/${orgId}/team/${team.id}/cycles`}
                     className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
                  >
                     <CyclePlayIcon className="size-3.5" />
                     {cycle.name}
                  </Link>
               </span>
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
                     <Star
                        className={cn('size-4', isFavorite && 'fill-amber-400 text-amber-400')}
                     />
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
                           <Star
                              className={cn(
                                 'size-4',
                                 isFavorite && 'fill-amber-400 text-amber-400'
                              )}
                           />
                           {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {/* is#16: o detalhe não tinha como excluir; o Undo do toast é a rede. */}
                        <DropdownMenuItem
                           variant="destructive"
                           onSelect={deleteCurrent}
                        >
                           <Trash2 className="size-4" />
                           Delete
                           <span className="ml-auto text-xs text-muted-foreground">⌘⌫</span>
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
            {nav && (
               <span className="text-xs text-muted-foreground mr-1">
                  {nav.index + 1} / {nav.total}
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
                  <Link ref={previousRef} href={`/${orgId}/issue/${previousIssue.identifier}`}>
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
                  <Link ref={nextRef} href={`/${orgId}/issue/${nextIssue.identifier}`}>
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
