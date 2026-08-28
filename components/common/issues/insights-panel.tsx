'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Issue } from '@/data/issues';
import type { Status } from '@/data/status';
import { usePriorities, useWorkflowOrderedStatuses } from '@/store/catalog-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { usePanelFilter } from './use-panel-filter';
import { api } from '@/lib/client';
import type { TimeMetrics } from '@/lib/api/aggregations';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const PRIORITY_COLORS: Record<string, string> = {
   'no-priority': '#64748b',
   'urgent': '#eb5757',
   'high': '#f2994a',
   'medium': '#facc15',
   'low': '#4cb782',
};

interface InsightsRow {
   status: Status;
   total: number;
   byPriority: Record<string, number>;
}

interface InsightsPanelProps {
   issues: Issue[];
}

/** Formata dias em "3.2d" ou "5h" quando < 1 dia. */
function fmtDays(d: number): string {
   if (d <= 0) return '—';
   if (d < 1) return `${Math.round(d * 24)}h`;
   return `${d}d`;
}

// Cache leve (módulo) das métricas — o cálculo faz full-scan das issues concluídas;
// TTL curto evita refetch a cada abertura do painel (M2) sem depender de invalidação
// por evento (30s de staleness é aceitável para métricas agregadas).
let metricsCache: { at: number; data: TimeMetrics } | null = null;
const METRICS_TTL_MS = 30_000;

/**
 * Faixa de métricas temporais (workspace): cycle time, lead time e throughput
 * das issues concluídas. Busca do servidor (deriva de startedAt/completedAt).
 */
function TimeMetricsStrip() {
   const [m, setM] = useState<TimeMetrics | null>(() =>
      metricsCache && Date.now() - metricsCache.at < METRICS_TTL_MS ? metricsCache.data : null
   );
   useEffect(() => {
      if (metricsCache && Date.now() - metricsCache.at < METRICS_TTL_MS) {
         setM(metricsCache.data);
         return;
      }
      let alive = true;
      api.issues
         .timeMetrics()
         .then((res) => {
            metricsCache = { at: Date.now(), data: res };
            if (alive) setM(res);
         })
         .catch(() => {});
      return () => {
         alive = false;
      };
   }, []);

   if (!m || m.sample === 0) return null;
   const maxWk = Math.max(1, ...m.throughput.map((t) => t.completed));

   return (
      <div className="px-4 pb-3 border-b">
         <div className="grid grid-cols-2 gap-3">
            <div>
               <div className="text-xs text-muted-foreground">Cycle time (median)</div>
               <div className="text-lg font-semibold tabular-nums">
                  {fmtDays(m.cycleTime.median)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                     avg {fmtDays(m.cycleTime.avg)} · p90 {fmtDays(m.cycleTime.p90)}
                  </span>
               </div>
            </div>
            <div>
               <div className="text-xs text-muted-foreground">Lead time (median)</div>
               <div className="text-lg font-semibold tabular-nums">
                  {fmtDays(m.leadTime.median)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                     avg {fmtDays(m.leadTime.avg)} · p90 {fmtDays(m.leadTime.p90)}
                  </span>
               </div>
            </div>
         </div>
         <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1">
               Throughput · {m.sample} completed
            </div>
            <div className="flex items-end gap-1 h-10">
               {m.throughput.map((t) => (
                  <div
                     key={t.weekStart}
                     className="flex-1 bg-primary/70 rounded-sm min-h-[2px]"
                     style={{ height: `${(t.completed / maxWk) * 100}%` }}
                     title={`${t.weekStart}: ${t.completed}`}
                  />
               ))}
            </div>
         </div>
      </div>
   );
}

/** Custom X axis tick rendering the status icon under each bar. */
function StatusTick(props: { x?: number; y?: number; payload?: { value: string } }) {
   const workflowOrderedStatus = useWorkflowOrderedStatuses();
   const { x = 0, y = 0, payload } = props;
   const currentStatus = workflowOrderedStatus.find((s) => s.id === payload?.value);
   if (!currentStatus) return <g />;

   const Icon = currentStatus.icon;
   return (
      <g transform={`translate(${x - 7}, ${y + 2})`}>
         <Icon />
      </g>
   );
}

/**
 * Analytics side panel ("insights"): issue count sliced by status and
 * segmented by priority — stacked bar chart + detail table.
 */
export function InsightsPanel({ issues }: InsightsPanelProps) {
   const { closePanel } = useRightPanelStore();
   const { isActive, toggle } = usePanelFilter();
   const workflowOrderedStatus = useWorkflowOrderedStatuses();
   const priorities = usePriorities();

   const rows = useMemo<InsightsRow[]>(() => {
      return workflowOrderedStatus
         .map((s) => {
            const statusIssues = issues.filter((issue) => issue.status.id === s.id);
            const byPriority: Record<string, number> = {};
            for (const priority of priorities) {
               byPriority[priority.id] = statusIssues.filter(
                  (issue) => issue.priority.id === priority.id
               ).length;
            }
            return { status: s, total: statusIssues.length, byPriority };
         })
         .filter((row) => row.total > 0);
   }, [issues, workflowOrderedStatus, priorities]);

   const chartData = useMemo(
      () =>
         rows.map((row) => ({
            id: row.status.id,
            name: row.status.name,
            ...row.byPriority,
         })),
      [rows]
   );

   return (
      <div className="flex flex-col h-full w-full">
         {/* Header */}
         <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-baseline gap-1.5">
               <span className="text-xl font-semibold">{issues.length}</span>
               <span className="text-sm text-muted-foreground">issues</span>
            </div>
            <Button
               variant="ghost"
               size="icon"
               className="size-7"
               onClick={closePanel}
               aria-label="Close"
            >
               <X className="size-4" />
            </Button>
         </div>

         {/* Time metrics (cycle/lead time + throughput) */}
         <div className="shrink-0">
            <TimeMetricsStrip />
         </div>

         {/* Stacked bar chart */}
         <div className="px-2 shrink-0 pt-2">
            <ResponsiveContainer width="100%" height={220}>
               <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis
                     dataKey="id"
                     tick={<StatusTick />}
                     axisLine={false}
                     tickLine={false}
                     interval={0}
                  />
                  <YAxis
                     width={34}
                     tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
                     axisLine={false}
                     tickLine={false}
                     allowDecimals={false}
                  />
                  <Tooltip
                     cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
                     contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                     }}
                  />
                  {priorities.map((priority) => (
                     <Bar
                        key={priority.id}
                        dataKey={priority.id}
                        name={priority.name}
                        stackId="issues"
                        fill={PRIORITY_COLORS[priority.id]}
                        isAnimationActive={false}
                        maxBarSize={22}
                     />
                  ))}
               </BarChart>
            </ResponsiveContainer>
         </div>

         {/* Detail table */}
         <div className="flex-1 overflow-auto border-t mt-2">
            <table className="w-full text-sm">
               <thead className="sticky top-0 bg-container z-10">
                  <tr className="text-left text-muted-foreground">
                     <th className="font-medium px-4 py-2">Status</th>
                     <th className="font-medium px-3 py-2 text-right">Issue count</th>
                     {priorities.map((priority) => {
                        const Icon = priority.icon;
                        return (
                           <th key={priority.id} className="font-medium px-3 py-2">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                 <Icon className="size-3.5 text-muted-foreground" />
                                 <span className="hidden xl:inline">{priority.name}</span>
                              </div>
                           </th>
                        );
                     })}
                  </tr>
               </thead>
               <tbody>
                  {rows.map((row) => {
                     const Icon = row.status.icon;
                     const target = { columnId: 'status' as const, value: row.status.id };
                     const active = isActive(target);
                     return (
                        <tr
                           key={row.status.id}
                           onClick={() => toggle(target)}
                           className={cn(
                              'group border-t border-border/50 cursor-pointer transition-colors hover:bg-accent/50',
                              active && 'bg-accent hover:bg-accent'
                           )}
                        >
                           <td className="px-4 py-2">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                 <Icon />
                                 <span className="truncate max-w-28">{row.status.name}</span>
                                 <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {active ? 'Clear filter' : 'Filter'}
                                 </span>
                              </div>
                           </td>
                           <td className="px-3 py-2 text-right font-medium">{row.total}</td>
                           {priorities.map((priority) => (
                              <td
                                 key={priority.id}
                                 className="px-3 py-2 text-right text-muted-foreground"
                              >
                                 {row.byPriority[priority.id]}
                              </td>
                           ))}
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         </div>
      </div>
   );
}
