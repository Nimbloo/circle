import { create } from 'zustand';
import { useMemo } from 'react';
import { Circle } from 'lucide-react';
import { status as mockStatuses, Status, StatusCategory } from '@/mock-data/status';
import { priorities as mockPriorities, Priority } from '@/mock-data/priorities';
import { LabelInterface, labels as mockLabels } from '@/mock-data/labels';
import { Health, health as mockHealth } from '@/mock-data/projects';
import type { WorkspaceBootstrap } from '@/lib/api/workspace';

/**
 * Catálogos (status/priority/label/health) vindos da API. A API carrega os DADOS
 * (id/name/color/category/position); os catálogos mock carregam apenas a
 * PRESENTAÇÃO UI-only (ícones React), mesclada por id — igual aos adapters de issue.
 *
 * O estado inicial é semeado com os catálogos demo (mock) para render instantâneo
 * (SSR/primeiro paint); o bootstrap do workspace (`workspace-store.hydrate`) chama
 * `setCatalogs` com os dados vivos, substituindo o seed. Não há fetch próprio aqui —
 * os catálogos já vêm no bootstrap do workspace, então não duplicamos rede.
 */

type CatalogBootstrap = Pick<
   WorkspaceBootstrap,
   'statuses' | 'priorities' | 'labels' | 'healthStates'
>;

const statusIconById = new Map(mockStatuses.map((s) => [s.id, s.icon]));
const priorityIconById = new Map(mockPriorities.map((p) => [p.id, p.icon]));

function toStatus(row: CatalogBootstrap['statuses'][number]): Status {
   return {
      id: row.id,
      name: row.name,
      color: row.color,
      category: row.category as StatusCategory,
      icon: statusIconById.get(row.id) ?? Circle,
   };
}

function toPriority(row: CatalogBootstrap['priorities'][number]): Priority {
   return {
      id: row.id,
      name: row.name,
      icon: priorityIconById.get(row.id) ?? (Circle as unknown as Priority['icon']),
   };
}

function toLabel(row: CatalogBootstrap['labels'][number]): LabelInterface {
   return { id: row.id, name: row.name, color: row.color };
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
   triage: 2,
   backlog: 3,
   completed: 4,
   canceled: 5,
};

/** Ordem de workflow (triage → … → canceled), usada pela tabela de insights. */
const WORKFLOW_CATEGORY_ORDER: Record<StatusCategory, number> = {
   triage: 0,
   backlog: 1,
   unstarted: 2,
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
   priorities: Priority[];
   labels: LabelInterface[];
   healthStates: Health[];
   /** Substitui os catálogos seed pelos dados vivos do bootstrap do workspace. */
   setCatalogs: (data: CatalogBootstrap) => void;
}

export const useCatalogStore = create<CatalogState>((set) => ({
   loaded: false,
   // Seed = catálogos demo (mock) p/ render instantâneo; trocado pela API no bootstrap.
   statuses: mockStatuses,
   priorities: mockPriorities,
   labels: mockLabels,
   healthStates: mockHealth,
   setCatalogs: (data) =>
      set({
         statuses: data.statuses.map(toStatus),
         priorities: data.priorities.map(toPriority),
         labels: data.labels.map(toLabel),
         healthStates: data.healthStates.map(toHealth),
         loaded: true,
      }),
}));

/* --------------------------- Hooks de conveniência -------------------------- */

export const useStatuses = (): Status[] => useCatalogStore((s) => s.statuses);
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
