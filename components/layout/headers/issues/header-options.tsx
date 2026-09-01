'use client';

import { Button } from '@/components/ui/button';
import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3, Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DisplayOptions } from '../display-options';
import { HeaderActions, ViewBar } from '@/components/layout/header-primitives';
import { IssueViewTabs } from './header-nav';

export default function HeaderOptions() {
   const { openPanel, togglePanel } = useRightPanelStore();
   const { teamId } = useParams<{ teamId?: string }>();

   // Export CSV (paridade Linear): baixa as issues do escopo (o browser envia o cookie de sessão).
   const exportCsv = () => {
      const q = teamId ? `?team=${encodeURIComponent(teamId)}` : '';
      window.open(`/api/v1/issues/export${q}`, '_blank');
   };

   return (
      <ViewBar>
         <IssueViewTabs />
         <HeaderActions>
            <IssueFilterTrigger />
            <Button size="xs" variant="ghost" onClick={exportCsv} aria-label="Export CSV">
               <Download className="size-4" />
            </Button>
            <Button
               size="xs"
               variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
               onClick={() => togglePanel('insights')}
               aria-label="Toggle insights panel"
            >
               <BarChart3 className="size-4" />
            </Button>
            <DisplayOptions />
         </HeaderActions>
      </ViewBar>
   );
}
