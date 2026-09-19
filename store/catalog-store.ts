import { create } from 'zustand';
import { useMemo } from 'react';
import { Circle } from 'lucide-react';
import { Status, StatusCategory, statusIconFor } from '@/data/status';
import { priorities as priorityPresentation, Priority } from '@/data/priorities';
import { LabelInterface } from '@/data/labels';
import { Health } from '@/data/projects';
import type { WorkspaceBootstrap } from '@/lib/api/workspace';
import type { StatusDto } from '@/lib/api/statuses';
import type { LabelDto } from '@/lib/api/labels';

/**
 * Catálogos (status/priority/label/health) vindos da API (#16). Nascem VAZIOS, com
 * `loaded=false` — nada de dado de demonstração: o bootstrap do workspace
 * (`workspace-store.hydrate`) chama `setCatalogs` com os dados vivos. O ícone de status
 * sai do próprio DTO (categoria + cor, `statusIconFor`); o de prioridade é presentação
 * fixa por id (os 5 níveis não mudam). Não há fetch próprio aqui — os catálogos já vêm
 * no bootstrap do workspace, então não duplicamos rede.
 */

type CatalogBootstrap = Pick<
   WorkspaceBootstrap,
   'statuses' | 'projectStatuses' | 'priorities' | 'labels' | 'healthStates'
>;

const priorityIconById = new Map(priorityPresentation.map((p) => [p.id, p.icon]));

type StatusLike = { id: string; name: string; color: string; category: string };

/**
 * Status na ordem do workflow (a da API) → tipo rico com ícone. O "pie" dos `started`
 * enche conforme a posição entre eles (estilo Linear).
 */
function toStatuses(rows: StatusLike[]): Status[] {
   const started = rows.filter((r) => r.category === 'started');
   const fraction = new Map(started.map((r, i) => [r.id, (i + 1) / (started.length + 1)]));
   return rows.map((row) => {
      const category = row.category as StatusCategory;
      return {
         id: row.id,
         name: row.name,
         color: row.color,
         category,
         icon: statusIconFor(category, row.color, fraction.get(row.id), row.name),
      };
   });
}

function toPriority(row: CatalogBootstrap['priorities'][number]): Priority {
   return {
      id: row.id,
      name: row.name,
      icon: priorityIconById.get(row.id) ?? (Circle as unknown as Priority['icon']),
   };
}

function toLabel(row: LabelDto & { groupId?: string | null }): LabelInterface {
   return { id: row.id, name: row.name, color: row.color, groupId: row.groupId };
}

function toHealth(row: CatalogBootstrap['healthStates'][number]): Health {
   return {
      id: row.id as Health['id'],
      name: row.name,
      color: row.color,
      description: row.description ?? '',
   };
}

/** Ordem de exibição no board (started primeiro, estilo Linear). */
const DISPLAY_CATEGORY_ORDER: Record<StatusCategory, number> = {
   started: 0,
   unstarted: 1,
   planned: 1,
   triage: 2,
   backlog: 3,
   completed: 4,
   canceled: 5,
};

/** Ordem das colunas do board de PROJETOS (Backlog → Planned → In Progress → …). */
const PROJECT_DISPLAY_CATEGORY_ORDER: Record<StatusCategory, number> = {
   backlog: 0,
   planned: 1,
   started: 2,
   unstarted: 2,
   triage: 3,
   completed: 4,
   canceled: 5,
};

/** Ordem de workflow (triage → … → canceled), usada pela tabela de insights. */
const WORKFLOW_CATEGORY_ORDER: Record<StatusCategory, number> = {
   triage: 0,
   backlog: 1,
   unstarted: 2,
   planned: 2,
   started: 3,
   completed: 4,
   canceled: 5,
};

/** Ordena por categoria; empate preserva a ordem vinda da API (índice do array). */
function orderStatuses(statuses: Status[], order: Record<StatusCategory, number>): Status[] {
   return statuses
      .map((s, index) => ({ s, index }))
      .sort((a, b) => order[a.s.category] - order[b.s.category] || a.index - b.index)
      .map((entry) => entry.s);
}

interface CatalogState {
   loaded: boolean;
   statuses: Status[];
   projectStatuses: Status[];
   priorities: Priority[];
   labels: LabelInterface[];
   healthStates: Health[];
   /** Substitui os catálogos seed pelos dados vivos do bootstrap do workspace. */
   setCatalogs: (data: CatalogBootstrap) => void;
   /** Splice de UM item a partir do DTO devolvido pela mutação, em vez de re-hidratar o
    * workspace inteiro. Cada um mexe SÓ na sua coleção. */
   applyLabel: (dto: LabelDto) => void;
   removeLabel: (id: string) => void;
   /** Lista inteira de labels (evento remoto): preserva o `groupId` já carregado. */
   setLabels: (dtos: LabelDto[]) => void;
   applyStatus: (dto: StatusDto) => void;
   /** Lista inteira já ordenada (retorno do reorder). */
   setStatuses: (dtos: StatusDto[]) => void;
   removeStatus: (id: string) => void;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
   return list.some((x) => x.id === item.id)
      ? list.map((x) => (x.id === item.id ? item : x))
      : [...list, item];
}

export const useCatalogStore = create<CatalogState>((set) => ({
   loaded: false,
   statuses: [],
   projectStatuses: [],
   priorities: [],
   labels: [],
   healthStates: [],
   setCatalogs: (data) =>
      set({
         statuses: toStatuses(data.statuses),
         projectStatuses: toStatuses(data.projectStatuses),
         priorities: data.priorities.map(toPriority),
         labels: data.labels.map(toLabel),
         healthStates: data.healthStates.map(toHealth),
         loaded: true,
      }),
   applyLabel: (dto) =>
      set((s) => {
         // LabelDto não traz groupId: preserva o do item já carregado. A API lista por
         // nome, então o upsert re-ordena igual para o novo/renomeado cair no lugar certo.
         const prev = s.labels.find((l) => l.id === dto.id);
         const next = toLabel({ ...dto, groupId: prev?.groupId });
         return { labels: upsert(s.labels, next).sort((a, b) => a.name.localeCompare(b.name)) };
      }),
   removeLabel: (id) => set((s) => ({ labels: s.labels.filter((l) => l.id !== id) })),
   setLabels: (dtos) =>
      set((s) => {
         const groupById = new Map(s.labels.map((l) => [l.id, l.groupId]));
         return { labels: dtos.map((d) => toLabel({ ...d, groupId: groupById.get(d.id) })) };
      }),
   // Status criado recebe a maior position (vai pro fim); editado fica na mesma casa.
   // Recalcula os ícones da lista toda: o "pie" dos started depende da posição.
   applyStatus: (dto) =>
      set((s) => ({ statuses: toStatuses(upsert<StatusLike>(s.statuses, dto)) })),
   setStatuses: (dtos) => set({ statuses: toStatuses(dtos) }),
   removeStatus: (id) =>
      set((s) => ({ statuses: toStatuses(s.statuses.filter((st) => st.id !== id)) })),
}));

/* --------------------------- Hooks de conveniência -------------------------- */

export const useStatuses = (): Status[] => useCatalogStore((s) => s.statuses);
export const useProjectStatuses = (): Status[] => useCatalogStore((s) => s.projectStatuses);
export const usePriorities = (): Priority[] => useCatalogStore((s) => s.priorities);
export const useLabels = (): LabelInterface[] => useCatalogStore((s) => s.labels);
export const useHealthStates = (): Health[] => useCatalogStore((s) => s.healthStates);

/** Status ordenados p/ exibição no board (colunas), a partir do catálogo hidratado. */
export const useDisplayOrderedStatuses = (): Status[] => {
   const statuses = useCatalogStore((s) => s.statuses);
   return useMemo(() => orderStatuses(statuses, DISPLAY_CATEGORY_ORDER), [statuses]);
};

/** Status na ordem de workflow (insights). */
export const useWorkflowOrderedStatuses = (): Status[] => {
   const statuses = useCatalogStore((s) => s.statuses);
   return useMemo(() => orderStatuses(statuses, WORKFLOW_CATEGORY_ORDER), [statuses]);
};

/** Status de PROJETO ordenados p/ as colunas do board de projetos. */
export const useDisplayOrderedProjectStatuses = (): Status[] => {
   const statuses = useCatalogStore((s) => s.projectStatuses);
   return useMemo(() => orderStatuses(statuses, PROJECT_DISPLAY_CATEGORY_ORDER), [statuses]);
};
