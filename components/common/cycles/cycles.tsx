'use client';

import { cooldownUntil, todayIso } from '@/data/cycles';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { Hourglass } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import CycleLine, { CyclePlayIcon } from './cycle-line';
import dynamic from 'next/dynamic';
import { CycleProgressLegend } from './cycle-progress-legend';
import { CycleBurnupEmpty } from './cycle-burnup-empty';

/**
 * O gráfico carrega recharts (357 KB no bundle, medido com o analisador). Sob demanda,
 * quem abre a lista de cycles não paga a biblioteca antes de ver a tela.
 */
const CycleBurnupChart = dynamic(
   () => import('./cycle-burnup-chart').then((m) => m.CycleBurnupChart),
   { ssr: false, loading: () => <div className="h-[216px]" /> }
);

/**
 * Cycles timeline: a date rail on the left and one row per cycle,
 * newest first. The current cycle is expanded with its burn-up chart.
 *
 * A rota é team-scoped (/team/[teamId]/cycles) → filtra os cycles pelo time da URL.
 * Sem isto a página mostrava os cycles de TODOS os times misturados, com links
 * apontando para o time errado.
 */
export default function Cycles() {
   const { teamId } = useParams<{ teamId?: string }>();
   const allCycles = useWorkspaceStore((state) => state.cycles);
   const loaded = useWorkspaceStore((state) => state.loaded);
   const cycles = useMemo(() => {
      const teamCycles = teamId ? allCycles.filter((cycle) => cycle.teamId === teamId) : allCycles;
      return [...teamCycles].sort((a, b) => b.startDate.localeCompare(a.startDate));
   }, [allCycles, teamId]);

   // O upcoming que a rota `/cycle/upcoming` mostra é o de menor startDate (pl#4).
   const nextUpcomingId = useMemo(
      () =>
         cycles
            .filter((c) => c.status === 'upcoming')
            .reduce<
               string | null
            >((best, c) => (best === null || c.startDate < (cycles.find((x) => x.id === best)?.startDate ?? '') ? c.id : best), null),
      [cycles]
   );
   // Ciclo sem rota própria abre os detalhes aqui mesmo.
   const [expandedId, setExpandedId] = useState<string | null>(null);

   // Cool-down (#24): sem cycle current entre o último completed e o próximo upcoming.
   // A linha entra na timeline (newest first) logo antes do primeiro cycle já encerrado.
   const until = useMemo(() => cooldownUntil(cycles, todayIso()), [cycles]);
   const cooldownBefore = until ? cycles.findIndex((c) => c.startDate < until) : -1;

   if (cycles.length === 0) {
      // Antes da 1ª carga do workspace a lista vazia não significa "sem cycles".
      if (!loaded) {
         return (
            <div data-testid="cycles-loading">
               <LoadingArea rows={4} />
            </div>
         );
      }
      return (
         <EmptyState
            icon={CyclePlayIcon}
            title="No cycles yet"
            description="Cycles focus your team over short, time-boxed windows. They show up here once a team turns them on."
         />
      );
   }

   return (
      <div className="content-enter w-full">
         {cycles.map((cycle, idx) => (
            <div key={cycle.id} className="flex w-full flex-col">
               {idx === cooldownBefore && until && (
                  <div className="flex w-full items-stretch">
                     <div className="relative w-14 shrink-0 sm:w-[126px]">
                        <div className="absolute bottom-0 left-[27.5px] top-0 w-px bg-border sm:left-[73.5px]" />
                     </div>
                     <div className="flex min-w-0 flex-1 items-center gap-4 py-4 text-[13px] leading-4 text-muted-foreground">
                        <Hourglass className="size-4 shrink-0" />
                        <span>Cool-down até {format(parseISO(until), 'MMM d')}</span>
                     </div>
                  </div>
               )}
               <div className="flex w-full items-stretch">
                  <div className="relative w-14 shrink-0 sm:w-[126px]">
                     <div className="absolute bottom-[4.5px] left-[27.5px] top-0 w-px bg-border sm:left-[73.5px]" />
                     <span className="absolute -bottom-4 left-0 hidden w-[63px] text-right text-xs font-[450] leading-[15px] text-muted-foreground sm:block">
                        {format(parseISO(cycle.startDate), 'MMM')}
                        <br />
                        {format(parseISO(cycle.startDate), 'd')}
                     </span>
                     <span
                        className={
                           'absolute -bottom-[4.5px] left-[23.5px] z-10 size-[9px] rounded-full border-2 bg-background sm:left-[69.5px] ' +
                           (cycle.status === 'current'
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/40')
                        }
                     />
                  </div>

                  <div className="min-w-0 flex-1 border-b border-border/60">
                     <CycleLine
                        cycle={cycle}
                        isNextUpcoming={cycle.id === nextUpcomingId}
                        expanded={expandedId === cycle.id}
                        onToggle={() =>
                           setExpandedId((current) => (current === cycle.id ? null : cycle.id))
                        }
                     />

                     {(cycle.status === 'current' || expandedId === cycle.id) && (
                        <div className="-mt-4 mb-4 flex h-[216px] items-stretch gap-5 px-2.5 xl:pr-[60px]">
                           <div className="min-w-0 flex-1">
                              {cycle.burnup?.length ? (
                                 <CycleBurnupChart cycle={cycle} height={216} />
                              ) : (
                                 <CycleBurnupEmpty height={216} />
                              )}
                           </div>
                           <div className="hidden w-[300px] shrink-0 items-center xl:flex">
                              <CycleProgressLegend cycle={cycle} />
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         ))}
      </div>
   );
}
