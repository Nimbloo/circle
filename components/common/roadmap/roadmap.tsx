'use client';

import { LoadingArea } from '@/components/common/loading-area';
import { adaptProject } from '@/lib/adapters-workspace';
import { api, type RoadmapDto } from '@/lib/client';
import { useRoadmapDisplayStore } from '@/store/roadmap-display-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import {
   INITIATIVE_CHANGED_EVENT,
   PROJECT_CHANGED_EVENT,
   useLiveReload,
} from '@/lib/use-live-sync';
import RoadmapTimeline, { type RoadmapRenderGroup } from './roadmap-timeline';

/**
 * Tela Roadmap (#102): os projetos do workspace na linha do tempo, agrupados por
 * initiative (a hierarquia de sub-initiatives vem indentada do servidor) e com as
 * dependências entre eles.
 *
 * O agrupamento, o rollup e o estado de atraso são calculados no servidor
 * (`lib/api/roadmap.ts`); aqui só resolvemos os projetos ricos pelo store para os
 * ícones e o reagendamento otimista continuarem valendo.
 */
const LIVE_RELOAD_DEBOUNCE_MS = 250;

export default function Roadmap() {
   const { showCompleted, showDependencies, showMilestones, showProjectList, ordering, zoom } =
      useRoadmapDisplayStore();
   const storeProjects = useWorkspaceStore((s) => s.projects);
   const [data, setData] = useState<RoadmapDto | null>(null);
   const [loading, setLoading] = useState(true);
   const [failed, setFailed] = useState(false);
   // Sequência (#40): só a resposta do pedido MAIS NOVO vale — uma lenta que chega
   // depois não desfaz a recarga mais recente.
   const seq = useRef(0);

   const load = useCallback(async () => {
      const mine = ++seq.current;
      try {
         const next = await api.roadmap.get({ includeCompleted: showCompleted, sort: ordering });
         if (mine !== seq.current) return;
         setData(next);
         setFailed(false);
      } catch {
         // Falha de refetch não apaga o roadmap já exibido; a 1ª carga vira ErrorState.
         if (mine === seq.current) setFailed(true);
      } finally {
         if (mine === seq.current) setLoading(false);
      }
   }, [showCompleted, ordering]);

   // Dependência, marco e rollup de initiative não mudam a assinatura do store: o
   // evento de janela do projeto/initiative recarrega, com debounce para uma rajada
   // (bulk, vários marcos) virar UMA busca.
   const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
   const scheduleReload = useCallback(() => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
         debounce.current = null;
         void load();
      }, LIVE_RELOAD_DEBOUNCE_MS);
   }, [load]);
   useEffect(
      () => () => {
         if (debounce.current) clearTimeout(debounce.current);
      },
      []
   );
   useLiveReload(PROJECT_CHANGED_EVENT, {}, scheduleReload);
   useLiveReload(INITIATIVE_CHANGED_EVENT, {}, scheduleReload);

   // Refaz o fetch quando as opções mudam e quando o workspace-store traz projeto
   // criado, movido de initiative, reagendado ou com status alterado — assim uma
   // mudança em outra aba aparece aqui (via `useLiveSync`) sem canal próprio.
   //
   // A dependência é uma ASSINATURA do conteúdo, não o array. A IDENTIDADE do array
   // do store muda a cada re-hidratação mesmo sem nada mudar, e como dependência ela
   // refazia a busca em cascata: medido em produção, quatro `GET /api/v1/roadmap` em
   // 4 s numa única carga de página, enquanto toda outra rota era chamada uma vez.
   const projectsSignature = useMemo(
      () =>
         storeProjects
            .map(
               (p) =>
                  `${p.id}:${p.initiative ?? ''}:${p.startDate}:${p.targetDate ?? ''}:${p.status.id}`
            )
            .sort()
            .join('|'),
      [storeProjects]
   );

   useEffect(() => {
      void load();
   }, [load, projectsSignature]);

   const groups = useMemo<RoadmapRenderGroup[]>(() => {
      if (!data) return [];
      // O projeto rico do store (ícone, catálogos) tem precedência; o DTO do roadmap
      // cobre o que ainda não hidratou.
      const byId = new Map(storeProjects.map((p) => [p.id, p]));
      for (const dto of data.projects) if (!byId.has(dto.id)) byId.set(dto.id, adaptProject(dto));
      return data.groups.map((group) => ({
         id: group.id,
         name: group.name,
         icon: group.icon,
         depth: group.depth,
         percentComplete: group.percentComplete,
         projectCount: group.projectCount,
         completedProjectCount: group.completedProjectCount,
         projects: group.projectIds
            .map((id) => byId.get(id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p)),
      }));
   }, [data, storeProjects]);

   if (!data && failed && !loading) {
      return (
         <ErrorState
            className="min-h-full"
            title="Could not load the roadmap"
            description="Check your connection and try again."
            action={
               <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                     setLoading(true);
                     void load();
                  }}
               >
                  Try again
               </Button>
            }
         />
      );
   }

   if (!data) {
      return (
         <div className="p-6">
            <LoadingArea rows={8} />
         </div>
      );
   }

   return (
      <div className="flex h-full w-full flex-col overflow-hidden">
         <div className="min-h-0 flex-1">
            <RoadmapTimeline
               groups={groups}
               milestones={data?.milestones ?? []}
               dependencies={data?.dependencies ?? []}
               zoom={zoom}
               showDependencies={showDependencies}
               showMilestones={showMilestones}
               showProjectList={showProjectList}
            />
         </div>
      </div>
   );
}
