'use client';

import { Button } from '@/components/ui/button';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { filterIssuesForView, filterProjectsForView } from '@/data/views';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useFavoritesStore } from '@/store/favorites-store';
import { cn } from '@/lib/utils';
import { BarChart3, MoreHorizontal, Star } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function Header() {
   const { viewId } = useParams<{ orgId: string; viewId: string }>();
   const view = useWorkspaceStore((s) => s.getViewById(viewId));
   const liveIssues = useIssuesStore((s) => s.issues);
   const liveProjects = useWorkspaceStore((s) => s.projects);
   const { openPanel, togglePanel } = useRightPanelStore();
   const isFavorite = useFavoritesStore((s) => s.isFavorite('view', viewId));
   const toggleFavorite = useFavoritesStore((s) => s.toggle);

   if (!view) return null;

   // Conta contra os stores vivos (hidratados da API), não os mocks.
   const count =
      view.type === 'issue'
         ? filterIssuesForView(view, liveIssues).length
         : filterProjectsForView(view, liveProjects).length;

   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <SidebarTrigger />
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs shrink-0">
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
               <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
            </HeaderGroup>
         </LocationBar>
         <ViewBar>
            <span className="text-xs text-muted-foreground">
               {count} {view.type === 'issue' ? 'issues' : 'projects'}
            </span>
            {view.type === 'issue' && (
               <HeaderActions>
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
