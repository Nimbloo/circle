'use client';

import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useMemo } from 'react';
import { SettingsShell } from './shared';

interface Bucket {
   key: string;
   label: string;
   count: number;
   color?: string;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
   return (
      <div className="rounded-lg border bg-container px-4 py-3">
         <div className="text-2xl font-semibold tabular-nums">{value}</div>
         <div className="text-sm text-muted-foreground">{label}</div>
         {hint && <div className="text-xs text-muted-foreground/70 mt-0.5">{hint}</div>}
      </div>
   );
}

/** Barras horizontais simples de distribuição (proporcional ao maior valor). */
function BarList({ title, buckets }: { title: string; buckets: Bucket[] }) {
   const max = Math.max(1, ...buckets.map((b) => b.count));
   return (
      <div className="rounded-lg border bg-container p-4">
         <h3 className="text-sm font-medium mb-3">{title}</h3>
         <div className="flex flex-col gap-2">
            {buckets.length === 0 && <div className="text-xs text-muted-foreground">Sem dados</div>}
            {buckets.map((b) => (
               <div key={b.key} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 text-xs text-muted-foreground truncate">
                     {b.label}
                  </div>
                  <div className="flex-1 h-2.5 rounded-full bg-muted/40 overflow-hidden">
                     <div
                        className="h-full rounded-full"
                        style={{
                           width: `${(b.count / max) * 100}%`,
                           backgroundColor: b.color ?? 'var(--primary)',
                        }}
                     />
                  </div>
                  <div className="w-8 shrink-0 text-right text-xs tabular-nums">{b.count}</div>
               </div>
            ))}
         </div>
      </div>
   );
}

const CATEGORY_ORDER = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];
const CATEGORY_LABEL: Record<string, string> = {
   triage: 'Triage',
   backlog: 'Backlog',
   unstarted: 'Todo',
   started: 'In Progress',
   completed: 'Completed',
   canceled: 'Canceled',
};

/** "Pulse" — dashboard de analytics do backlog (computado sobre as issues carregadas). */
export default function PulseSettings() {
   const issues = useIssuesStore((s) => s.issues);
   const teams = useWorkspaceStore((s) => s.teams);

   const data = useMemo(() => {
      const byCategory = new Map<string, { count: number; color: string }>();
      const byStatus = new Map<string, { count: number; color: string }>();
      const byPriority = new Map<string, number>();
      const byTeam = new Map<string, number>();

      for (const i of issues) {
         const cat = i.status?.category ?? 'backlog';
         const c = byCategory.get(cat) ?? { count: 0, color: i.status?.color ?? '#888' };
         c.count += 1;
         byCategory.set(cat, c);

         const sName = i.status?.name ?? '—';
         const s = byStatus.get(sName) ?? { count: 0, color: i.status?.color ?? '#888' };
         s.count += 1;
         byStatus.set(sName, s);

         const pName = i.priority?.name ?? 'No priority';
         byPriority.set(pName, (byPriority.get(pName) ?? 0) + 1);

         if (i.teamId) byTeam.set(i.teamId, (byTeam.get(i.teamId) ?? 0) + 1);
      }

      const total = issues.length;
      const completed = byCategory.get('completed')?.count ?? 0;
      const inProgress = byCategory.get('started')?.count ?? 0;
      const backlog =
         (byCategory.get('backlog')?.count ?? 0) + (byCategory.get('triage')?.count ?? 0);

      const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

      return {
         total,
         completed,
         inProgress,
         backlog,
         completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
         statusBuckets: CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
            key: c,
            label: CATEGORY_LABEL[c] ?? c,
            count: byCategory.get(c)!.count,
            color: byCategory.get(c)!.color,
         })),
         priorityBuckets: [...byPriority.entries()]
            .map(([label, count]) => ({ key: label, label, count }))
            .sort((a, b) => b.count - a.count),
         teamBuckets: [...byTeam.entries()]
            .map(([id, count]) => ({ key: id, label: teamName(id), count }))
            .sort((a, b) => b.count - a.count),
      };
   }, [issues, teams]);

   return (
      <SettingsShell
         title="Pulse"
         description="Uma visão do backlog: distribuição por status, prioridade e time, com a taxa de conclusão."
      >
         <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total de issues" value={String(data.total)} />
            <StatCard
               label="Concluídas"
               value={`${data.completionRate}%`}
               hint={`${data.completed} de ${data.total}`}
            />
            <StatCard label="Em progresso" value={String(data.inProgress)} />
            <StatCard label="Backlog" value={String(data.backlog)} />
         </div>

         <div className="flex flex-col gap-3">
            <BarList title="Por status" buckets={data.statusBuckets} />
            <div className="grid md:grid-cols-2 gap-3">
               <BarList title="Por prioridade" buckets={data.priorityBuckets} />
               <BarList title="Por time" buckets={data.teamBuckets} />
            </div>
         </div>
      </SettingsShell>
   );
}
