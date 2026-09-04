'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { api, type ProjectSnapshotPoint } from '@/lib/client';
import { useEffect, useState } from 'react';
import { ProjectSnapshotChart } from './project-snapshot-chart';

interface ProgressHistoryProps {
   /** Série de um projeto. Mutuamente exclusivo com `initiativeId`. */
   projectId?: string;
   /** Série agregada dos projetos da subárvore de uma initiative. */
   initiativeId?: string;
   title?: string;
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
   const [points, setPoints] = useState<ProjectSnapshotPoint[] | null>(null);

   useEffect(() => {
      let active = true;
      const request = projectId
         ? api.projectSnapshots.list(projectId)
         : initiativeId
           ? api.projectSnapshots.forInitiative(initiativeId)
           : Promise.resolve([]);
      request
         .then((series) => {
            if (active) setPoints(series);
         })
         .catch(() => {
            if (active) setPoints([]);
         });
      return () => {
         active = false;
      };
   }, [projectId, initiativeId]);

   return (
      <div className="flex flex-col gap-2">
         <span className="text-[13px] font-medium leading-4">{title}</span>
         {points === null ? (
            <Skeleton className="h-[120px] w-full" />
         ) : (
            <ProjectSnapshotChart points={points} />
         )}
      </div>
   );
}
