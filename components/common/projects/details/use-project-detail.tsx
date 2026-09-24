'use client';

import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useRef,
   useState,
   type ReactNode,
} from 'react';
import type { ProjectDetail } from '@/data/project-details';
import { adaptProjectDetail, emptyProjectDetail } from '@/lib/adapters-project-detail';
import { api, type ProjectSnapshotPoint } from '@/lib/client';
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
   /**
    * Envolve um save da descrição: enquanto ele voa (e depois que confirma), um refetch
    * que saiu ANTES não sobrescreve a descrição/versão com o conteúdo antigo.
    */
   trackDescriptionSave: <T>(save: Promise<T>) => Promise<T>;
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
   const writes = useRef({ inFlight: 0, seq: 0 });

   const load = useCallback(async () => {
      if (!projectId) return;
      const mine = ++seq.current;
      const writesAtStart = writes.current.seq;
      try {
         const dto = await api.projects.detail(projectId);
         if (mine !== seq.current) return;
         const detail = adaptProjectDetail(dto);
         const stale = writes.current.inFlight > 0 || writes.current.seq !== writesAtStart;
         setState((prev) =>
            // Save da descrição no meio do caminho: o resto do detalhe entra, a descrição
            // e a versão ficam as que o save deixou.
            stale && prev.id === projectId && prev.status === 'ready'
               ? {
                    ...prev,
                    detail: {
                       ...detail,
                       description: prev.detail.description,
                       descriptionDoc: prev.detail.descriptionDoc,
                    },
                 }
               : {
                    id: projectId,
                    status: 'ready',
                    detail,
                    descriptionVersion: dto.descriptionVersion ?? null,
                 }
         );
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

   useLiveReload(PROJECT_CHANGED_EVENT, { id: projectId ?? undefined }, (event) => {
      // Eco do próprio autosave da descrição: a resposta do save já trouxe a versão.
      if (event.own && event.scope === 'content') return;
      if (projectId) void load();
   });

   const trackDescriptionSave = useCallback(<T,>(save: Promise<T>): Promise<T> => {
      const w = writes.current;
      w.inFlight += 1;
      w.seq += 1;
      return save.then(
         (value) => {
            w.inFlight -= 1;
            w.seq += 1;
            return value;
         },
         (error: unknown) => {
            w.inFlight -= 1;
            throw error;
         }
      );
   }, []);

   const setDetail = useCallback(
      (update: (prev: ProjectDetail) => ProjectDetail) =>
         setState((prev) => ({ ...prev, detail: update(prev.detail) })),
      []
   );
   const setDescriptionVersion = useCallback(
      (descriptionVersion: string | null) => setState((prev) => ({ ...prev, descriptionVersion })),
      []
   );

   const status = state.id === projectId ? state.status : 'loading';
   return useMemo(
      () => ({
         status,
         detail: state.detail,
         descriptionVersion: state.descriptionVersion,
         reload: load,
         setDetail,
         setDescriptionVersion,
         trackDescriptionSave,
      }),
      [
         status,
         state.detail,
         state.descriptionVersion,
         load,
         setDetail,
         setDescriptionVersion,
         trackDescriptionSave,
      ]
   );
}

/* ----------------------- dependências e snapshots (pl#6) ---------------------- */

export interface ProjectDependenciesState {
   /** `null` enquanto a 1ª carga não respondeu — a UI não afirma "No dependencies". */
   ids: string[] | null;
   setIds: (ids: string[]) => void;
}

/**
 * "Depends on" do projeto: carrega uma vez e recarrega no evento remoto do projeto
 * (`setDependencies` publica `project updated`), então a lista fica ao vivo (pl#8).
 */
export function useProjectDependencies(projectId: string | null): ProjectDependenciesState {
   const [state, setState] = useState<{ id: string | null; ids: string[] | null }>({
      id: projectId,
      ids: null,
   });
   const seq = useRef(0);
   const load = useCallback(async () => {
      if (!projectId) return;
      const mine = ++seq.current;
      try {
         const ids = await api.projectDependencies.list(projectId);
         if (mine === seq.current) setState({ id: projectId, ids });
      } catch {
         // Falha mantém o que já estava; na 1ª carga vira lista vazia.
         if (mine === seq.current)
            setState((prev) =>
               prev.id === projectId && prev.ids ? prev : { id: projectId, ids: [] }
            );
      }
   }, [projectId]);
   useEffect(() => {
      if (!projectId) return;
      setState({ id: projectId, ids: null });
      void load();
      return () => {
         seq.current += 1;
      };
   }, [projectId, load]);
   useLiveReload(PROJECT_CHANGED_EVENT, { id: projectId ?? undefined }, (event) => {
      // Salvar a descrição não mexe nas dependências.
      if (event.scope === 'content') return;
      if (projectId) void load();
   });
   const setIds = useCallback(
      (ids: string[]) => {
         seq.current += 1; // a gravação local vence uma leitura em voo
         setState({ id: projectId, ids });
      },
      [projectId]
   );
   const ids = state.id === projectId ? state.ids : null;
   return useMemo(() => ({ ids, setIds }), [ids, setIds]);
}

/** Série "Progress over time" do projeto; `null` enquanto carrega. */
export function useProjectSnapshots(projectId: string | null): ProjectSnapshotPoint[] | null {
   const [state, setState] = useState<{ id: string | null; points: ProjectSnapshotPoint[] | null }>(
      { id: projectId, points: null }
   );
   useEffect(() => {
      if (!projectId) return;
      let active = true;
      setState({ id: projectId, points: null });
      api.projectSnapshots
         .list(projectId)
         .then((points) => {
            if (active) setState({ id: projectId, points });
         })
         .catch(() => {
            if (active) setState({ id: projectId, points: [] });
         });
      return () => {
         active = false;
      };
   }, [projectId]);
   return state.id === projectId ? state.points : null;
}

interface ProjectContextValue {
   projectId: string;
   state: ProjectDetailState;
   dependencies: ProjectDependenciesState;
   snapshots: ProjectSnapshotPoint[] | null;
}

const ProjectDetailContext = createContext<ProjectContextValue | null>(null);

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
   const dependencies = useProjectDependencies(projectId);
   const snapshots = useProjectSnapshots(projectId);
   const value = useMemo(
      () => ({ projectId, state, dependencies, snapshots }),
      [projectId, state, dependencies, snapshots]
   );
   return <ProjectDetailContext.Provider value={value}>{children}</ProjectDetailContext.Provider>;
}

/** Detalhe do projeto: o do provider da rota quando houver, senão carrega sozinho (peek). */
export function useSharedProjectDetail(projectId: string): ProjectDetailState {
   const ctx = useContext(ProjectDetailContext);
   const shared = ctx?.projectId === projectId ? ctx.state : null;
   const own = useProjectDetail(shared ? null : projectId);
   return shared ?? own;
}

/** Dependências do provider da rota quando houver; senão carrega sozinho (peek). */
export function useSharedProjectDependencies(projectId: string): ProjectDependenciesState {
   const ctx = useContext(ProjectDetailContext);
   const shared = ctx?.projectId === projectId ? ctx.dependencies : null;
   const own = useProjectDependencies(shared ? null : projectId);
   return shared ?? own;
}

/** Snapshots do provider da rota quando houver; senão carrega sozinho. */
export function useSharedProjectSnapshots(projectId: string): ProjectSnapshotPoint[] | null {
   const ctx = useContext(ProjectDetailContext);
   const shared = ctx?.projectId === projectId ? ctx : null;
   const own = useProjectSnapshots(shared ? null : projectId);
   return shared ? shared.snapshots : own;
}
