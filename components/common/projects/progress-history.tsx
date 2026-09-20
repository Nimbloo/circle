'use client';

import { LoadingArea } from '@/components/common/loading-area';
import { api, type ProjectSnapshotPoint } from '@/lib/client';
import { useEffect, useState } from 'react';
import { ProjectSnapshotChart } from './project-snapshot-chart';
import { useSharedProjectSnapshots } from './details/use-project-detail';

interface ProgressHistoryProps {
   /** Série de um projeto. Mutuamente exclusivo com `initiativeId`. */
   projectId?: string;
   /** Série agregada dos projetos da subárvore de uma initiative. */
   initiativeId?: string;
   title?: string;
}

/** Série agregada da initiative (sem provider: a página da initiative é uma só). */
function useInitiativeSnapshots(initiativeId: string | undefined): ProjectSnapshotPoint[] | null {
   const [points, setPoints] = useState<ProjectSnapshotPoint[] | null>(null);
   useEffect(() => {
      if (!initiativeId) return;
      let active = true;
      setPoints(null);
      api.projectSnapshots
         .forInitiative(initiativeId)
         .then((series) => {
            if (active) setPoints(series);
         })
         .catch(() => {
            if (active) setPoints([]);
         });
      return () => {
         active = false;
      };
   }, [initiativeId]);
   return points;
}

/**
 * Seção "Progress over time" (#102): busca a série de snapshots (o GET grava o dia
 * corrente antes de responder) e desenha o gráfico de linha. Falha de rede vira
 * série vazia — o gráfico some, o resto do painel continua de pé.
 */
export function ProgressHistory({
   projectId,
   initiativeId,
   title = 'Progress over time',
}: ProgressHistoryProps) {
   const projectPoints = useSharedProjectSnapshots(projectId ?? '');
   const initiativePoints = useInitiativeSnapshots(projectId ? undefined : initiativeId);
   const points = projectId ? projectPoints : initiativePoints;

   return (
      <div className="flex flex-col gap-2">
         <span className="text-[13px] font-medium leading-4">{title}</span>
         {points === null ? (
            <LoadingArea rows={3} size="sm" className="h-[120px]" />
         ) : (
            <ProjectSnapshotChart points={points} />
         )}
      </div>
   );
}
