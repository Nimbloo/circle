'use client';

import { Button } from '@/components/ui/button';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { ViewActions } from '@/components/common/views/view-actions';
import { filterIssuesForView, filterProjectsForView } from '@/data/views';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useFavoritesStore } from '@/store/favorites-store';
import { cn } from '@/lib/utils';
import { BarChart3, ChevronRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function Header() {
   const { orgId, viewId } = useParams<{ orgId: string; viewId: string }>();
   const view = useWorkspaceStore((s) => s.getViewById(viewId));
   const teams = useWorkspaceStore((s) => s.teams);
   const liveIssues = useIssuesStore((s) => s.issues);
   const liveProjects = useWorkspaceStore((s) => s.projects);
   const { openPanel, togglePanel } = useRightPanelStore();
   const isFavorite = useFavoritesStore((s) => s.isFavorite('view', viewId));
   const toggleFavorite = useFavoritesStore((s) => s.toggle);

   if (!view) return null;

   const team = view.teamId ? teams.find((candidate) => candidate.id === view.teamId) : undefined;

   // Conta contra os stores vivos (hidratados da API), não os mocks.
   const count =
      view.type === 'issue'
         ? filterIssuesForView(view, liveIssues).length
         : filterProjectsForView(view, liveProjects).length;

   return (
      <>
         <LocationBar>
            <HeaderGroup className="pl-2.5">
               {team ? (
                  <>
                     <Link
                        href={`/${orgId}/team/${team.id}/overview`}
                        className="flex min-w-0 shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                     >
                        <span className="inline-flex size-4 items-center justify-center rounded bg-muted/50 text-[10px]">
                           {team.icon}
                        </span>
                        <span className="max-w-36 truncate text-[13px] font-medium">
                           {team.name}
                        </span>
                     </Link>
                     <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                     <Link
                        href={`/${orgId}/team/${team.id}/views`}
                        className="shrink-0 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                     >
                        Views
                     </Link>
                     <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </>
               ) : (
                  <>
                     <Link
                        href={`/${orgId}/views`}
                        className="shrink-0 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                     >
                        Views
                     </Link>
                     <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </>
               )}
               <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-muted/50 text-[10px]">
                  {view.icon}
               </span>
               <HeaderTitle>{view.name}</HeaderTitle>
               <button
                  type="button"
                  onClick={() => void toggleFavorite('view', viewId)}
                  aria-label={isFavorite ? 'Unfavorite view' : 'Favorite view'}
                  className="shrink-0 ml-1"
               >
                  <Star
                     className={cn(
                        'size-3.5 transition-colors',
                        isFavorite
                           ? 'fill-yellow-400 text-yellow-400'
                           : 'text-muted-foreground hover:text-foreground'
                     )}
                  />
               </button>
               <ViewActions view={view} />
            </HeaderGroup>
         </LocationBar>
         <ViewBar className="pl-[18px] pr-2.5">
            <span className="translate-y-[0.5px] text-xs font-[450] leading-[normal] text-muted-foreground">
               {count} {view.type === 'issue' ? 'issues' : 'projects'}
            </span>
            {view.type === 'issue' && (
               <HeaderActions className="pr-0">
                  <Button
                     size="xs"
                     variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
                     onClick={() => togglePanel('insights')}
                     aria-label="Toggle insights"
                  >
                     <BarChart3 className="size-4" />
                  </Button>
               </HeaderActions>
            )}
         </ViewBar>
      </>
   );
}
