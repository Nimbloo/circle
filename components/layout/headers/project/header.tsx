'use client';

import { Button } from '@/components/ui/button';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { DetailPanelToggle } from '@/components/common/detail-side-panel';
import { DisplayOptions } from '../display-options';
import { cn } from '@/lib/utils';
import { useDetailPanelStore } from '@/store/detail-panel-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const PROJECT_TABS = [
   { label: 'Overview', segment: 'overview' },
   { label: 'Activity', segment: 'activity' },
   { label: 'Issues', segment: 'issues' },
];

function ProjectTabs({ projectId }: { projectId: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();

   return (
      <HeaderActions>
         {PROJECT_TABS.map((tab) => {
            const href = `/${orgId}/project/${projectId}/${tab.segment}`;
            const isActive = pathname === href;
            return (
               <Link
                  key={tab.segment}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
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
      </HeaderActions>
   );
}

function PanelToggles() {
   const { openPanel, togglePanel } = useRightPanelStore();
   const panelOpen = useDetailPanelStore((s) => s.openByKind.project);
   const setPanelOpen = useDetailPanelStore((s) => s.setOpen);
   // "Display" (list/board, agrupamento, propriedades) só na aba Issues — é a lista.
   const pathname = usePathname();
   const onIssuesTab = pathname.endsWith('/issues');

   return (
      <div className="flex items-center gap-1">
         {onIssuesTab && <DisplayOptions />}
         <div className="hidden items-center gap-1 xl:flex">
            <Button
               size="xs"
               variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
               onClick={() => {
                  togglePanel('insights');
                  // Ligar o Insights com o painel fechado não mostraria nada: abre o painel.
                  if (openPanel !== 'insights' && !panelOpen) setPanelOpen('project', true);
               }}
               aria-label="Toggle insights panel"
               aria-pressed={openPanel === 'insights'}
            >
               <BarChart3 className="size-4" />
            </Button>
            <DetailPanelToggle kind="project" />
         </div>
      </div>
   );
}

export default function Header({ projectId }: { projectId: string }) {
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   if (!project) return null;

   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <div className="flex min-w-0 items-center gap-1.5 text-sm">
                  <span className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0">
                     <project.icon className="size-3.5" />
                  </span>
                  <HeaderTitle>{project.name}</HeaderTitle>
               </div>
            </HeaderGroup>
         </LocationBar>
         <ViewBar>
            <ProjectTabs projectId={project.id} />
            <PanelToggles />
         </ViewBar>
      </>
   );
}
