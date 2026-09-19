'use client';

import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useRef,
   useState,
   type ReactNode,
} from 'react';
import type { ProjectDetail } from '@/data/project-details';
import { adaptProjectDetail, emptyProjectDetail } from '@/lib/adapters-project-detail';
import { api } from '@/lib/client';
import { PROJECT_CHANGED_EVENT, useLiveReload } from '@/lib/use-live-sync';

export type ProjectDetailStatus = 'loading' | 'ready' | 'error';

export interface ProjectDetailState {
   /** `loading` até a 1ª resposta; `error` só se a 1ª carga falhar (refetch preserva). */
   status: ProjectDetailStatus;
   detail: ProjectDetail;
   /** Versão da descrição vista pelo cliente (#18) — `null` antes da 1ª carga. */
   descriptionVersion: string | null;
   /** Recarrega em silêncio; resposta velha (fora de ordem) é descartada. */
   reload: () => Promise<void>;
   /** Ajuste local (otimista) do detalhe já carregado. */
   setDetail: (update: (prev: ProjectDetail) => ProjectDetail) => void;
   setDescriptionVersion: (version: string | null) => void;
}

/**
 * Detalhe editorial do projeto (#45, R4): loading/ready/error, sequência (só a resposta
 * mais nova vale), live reload pelo evento de janela do projeto e falha de refetch que
 * PRESERVA o que já está na tela. `projectId = null` desliga o hook (consumidor dentro
 * de um `ProjectDetailProvider` usa o do contexto).
 */
export function useProjectDetail(projectId: string | null): ProjectDetailState {
   const [state, setState] = useState<{
      id: string | null;
      status: ProjectDetailStatus;
      detail: ProjectDetail;
      descriptionVersion: string | null;
   }>(() => ({
      id: projectId,
      status: 'loading',
      detail: emptyProjectDetail(projectId ?? ''),
      descriptionVersion: null,
   }));
   const seq = useRef(0);

   const load = useCallback(async () => {
      if (!projectId) return;
      const mine = ++seq.current;
      try {
         const dto = await api.projects.detail(projectId);
         if (mine !== seq.current) return;
         setState({
            id: projectId,
            status: 'ready',
            detail: adaptProjectDetail(dto),
            descriptionVersion: dto.descriptionVersion ?? null,
         });
      } catch {
         if (mine !== seq.current) return;
         // Refetch que falha não apaga a tela; só a 1ª carga vira `error`.
         setState((prev) =>
            prev.id === projectId && prev.status === 'ready' ? prev : { ...prev, status: 'error' }
         );
      }
   }, [projectId]);

   useEffect(() => {
      if (!projectId) return;
      setState({
         id: projectId,
         status: 'loading',
         detail: emptyProjectDetail(projectId),
         descriptionVersion: null,
      });
      void load();
      return () => {
         seq.current += 1; // descarta resposta em voo do projeto anterior
      };
   }, [projectId, load]);

   useLiveReload(PROJECT_CHANGED_EVENT, { id: projectId ?? undefined }, () => {
      if (projectId) void load();
   });

   const setDetail = useCallback(
      (update: (prev: ProjectDetail) => ProjectDetail) =>
         setState((prev) => ({ ...prev, detail: update(prev.detail) })),
      []
   );
   const setDescriptionVersion = useCallback(
      (descriptionVersion: string | null) => setState((prev) => ({ ...prev, descriptionVersion })),
      []
   );

   return {
      status: state.id === projectId ? state.status : 'loading',
      detail: state.detail,
      descriptionVersion: state.descriptionVersion,
      reload: load,
      setDetail,
      setDescriptionVersion,
   };
}

const ProjectDetailContext = createContext<{ projectId: string; state: ProjectDetailState } | null>(
   null
);

/**
 * Um fetch do detalhe por projeto, compartilhado pelas abas (overview/issues/activity) —
 * montado no `layout.tsx` da rota, sobrevive à troca de aba (R5).
 */
export function ProjectDetailProvider({
   projectId,
   children,
}: {
   projectId: string;
   children: ReactNode;
}) {
   const state = useProjectDetail(projectId);
   return (
      <ProjectDetailContext.Provider value={{ projectId, state }}>
         {children}
      </ProjectDetailContext.Provider>
   );
}

/** Detalhe do projeto: o do provider da rota quando houver, senão carrega sozinho (peek). */
export function useSharedProjectDetail(projectId: string): ProjectDetailState {
   const ctx = useContext(ProjectDetailContext);
   const shared = ctx?.projectId === projectId ? ctx.state : null;
   const own = useProjectDetail(shared ? null : projectId);
   return shared ?? own;
}
