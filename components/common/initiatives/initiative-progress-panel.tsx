'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Initiative } from '@/mock-data/initiatives';
import { health as allHealth } from '@/mock-data/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useMemo, useState } from 'react';

type BreakdownTab = 'health' | 'status' | 'teams' | 'leads';

const PROGRESS_COLORS = { scope: '#95a2b3', started: '#f2c94c', completed: '#5e6ad2' };

/** Progress snapshot + Health/Status/Teams/Leads breakdown of an initiative. */
export function InitiativeProgressPanel({ initiative }: { initiative: Initiative }) {
   const [tab, setTab] = useState<BreakdownTab>('teams');
   const getInitiativeProjects = useWorkspaceStore((s) => s.getInitiativeProjects);
   const teams = useWorkspaceStore((s) => s.teams);
   const projects = useMemo(
      () => getInitiativeProjects(initiative.id),
      [initiative, getInitiativeProjects]
   );

   const progress = useMemo(() => {
      const total = projects.length;
      const completed = projects.filter(
         (project) => project.status.category === 'completed'
      ).length;
      const started = projects.filter((project) => project.status.category === 'started').length;
      return { total, completed, started, remaining: Math.max(0, total - completed - started) };
   }, [projects]);

   const rows = useMemo(() => {
      if (tab === 'teams') {
         const byTeam = new Map<string, number>();
         for (const project of projects) {
            byTeam.set(project.teamId, (byTeam.get(project.teamId) ?? 0) + 1);
         }
         return [...byTeam.entries()].map(([teamId, count]) => {
            const team = teams.find((entry) => entry.id === teamId);
            return { key: teamId, icon: team?.icon ?? '👥', label: team?.name ?? teamId, count };
         });
      }
      if (tab === 'leads') {
         const byLead = new Map<string, { label: string; avatarUrl?: string; count: number }>();
         for (const project of projects) {
            const lead = project.lead;
            if (!lead) continue;
            const existing = byLead.get(lead.id);
            if (existing) existing.count += 1;
            else
               byLead.set(lead.id, {
                  label: lead.name,
                  avatarUrl: lead.avatarUrl,
                  count: 1,
               });
         }
         return [...byLead.entries()].map(([key, row]) => ({ key, ...row, icon: undefined }));
      }
      if (tab === 'status') {
         const byStatus = new Map<string, { label: string; color: string; count: number }>();
         for (const project of projects) {
            const existing = byStatus.get(project.status.id);
            if (existing) existing.count += 1;
            else
               byStatus.set(project.status.id, {
                  label: project.status.name,
                  color: project.status.color,
                  count: 1,
               });
         }
         return [...byStatus.entries()].map(([key, row]) => ({ key, ...row, icon: undefined }));
      }
      return allHealth
         .map((entry) => ({
            key: entry.id,
            label: entry.name,
            color: entry.color,
            icon: undefined,
            count: projects.filter((project) => project.health.id === entry.id).length,
         }))
         .filter((row) => row.count > 0);
   }, [tab, projects, teams]);

   return (
      <div className="flex flex-col gap-3">
         <span className="text-sm font-medium">Progress</span>
         {progress.total === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No progress history yet.</p>
         ) : (
            <div className="flex flex-col gap-2">
               <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                     style={{
                        width: `${(progress.completed / progress.total) * 100}%`,
                        backgroundColor: PROGRESS_COLORS.completed,
                     }}
                  />
                  <div
                     style={{
                        width: `${(progress.started / progress.total) * 100}%`,
                        backgroundColor: PROGRESS_COLORS.started,
                     }}
                  />
               </div>
               <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                     <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: PROGRESS_COLORS.completed }}
                     />
                     Completed {progress.completed}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                     <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: PROGRESS_COLORS.started }}
                     />
                     Started {progress.started}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                     <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: PROGRESS_COLORS.scope }}
                     />
                     Remaining {progress.remaining}
                  </span>
               </div>
            </div>
         )}
         <div className="flex items-center gap-1.5 flex-wrap">
            {(
               [
                  ['health', 'Health'],
                  ['status', 'Status'],
                  ['teams', 'Teams'],
                  ['leads', 'Leads'],
               ] as const
            ).map(([key, label]) => (
               <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                     'px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                     tab === key
                        ? 'bg-accent border-transparent'
                        : 'text-muted-foreground hover:bg-accent/50'
                  )}
               >
                  {label}
               </button>
            ))}
         </div>
         <div className="flex flex-col gap-1">
            {rows.map((row) => (
               <div key={row.key} className="flex items-center gap-2 text-sm py-1">
                  {'avatarUrl' in row ? (
                     <Avatar className="size-5">
                        <AvatarImage src={row.avatarUrl || undefined} alt={row.label} />
                        <AvatarFallback className="text-[9px]">{row.label?.[0]}</AvatarFallback>
                     </Avatar>
                  ) : 'color' in row && row.color ? (
                     <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                     />
                  ) : (
                     <span className="text-sm">{row.icon}</span>
                  )}
                  <span className="flex-1 truncate">{row.label}</span>
                  <span className="text-muted-foreground text-xs">{row.count}</span>
               </div>
            ))}
         </div>
      </div>
   );
}
