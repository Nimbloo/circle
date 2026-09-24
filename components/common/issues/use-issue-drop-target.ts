'use client';

import type { RefObject } from 'react';
import { useDrop } from 'react-dnd';
import type { Issue } from '@/data/issues';
import type { Priority } from '@/data/priorities';
import type { Project } from '@/data/projects';
import type { Status } from '@/data/status';
import type { User } from '@/data/users';
import { useViewKey } from '@/lib/view-key';
import {
   getViewDisplaySettings,
   useDisplaySettingsStore,
   type OrderingKey,
} from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import type { IssueGroupContext } from './group-issues';

export const IssueDragType = 'ISSUE';

/**
 * Campo que o grupo impõe à issue solta nele (drop vindo de outro grupo). Ausente = o
 * agrupamento não tem destino inequívoco (ex.: label, multi-valorado) e o drop é recusado.
 */
export type GroupDropValue =
   | { field: 'status'; status: Status }
   | { field: 'priority'; priority: Priority }
   | { field: 'assignee'; assignee: User | null }
   | { field: 'project'; project: Project | undefined };

export type IssueDropPlan =
   | { kind: 'none' }
   | { kind: 'reorder'; beforeId: string | null; afterId: string | null; switchToManual: boolean }
   | { kind: 'move'; value: GroupDropValue; subValue?: GroupDropValue };

/** Resultado do drop do card → o container lê `didDrop()` e não trata de novo. */
type IssueDropResult = { handled: true };

const byRank = (a: Issue, b: Issue) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

const inGroup = (item: Issue, target: IssueGroupContext) =>
   target.issues.some((i) => i.id === item.id);

/** A issue já tem o valor que o grupo impõe (drop entre sub-grupos do mesmo grupo). */
function issueHasValue(item: Issue, value: GroupDropValue): boolean {
   switch (value.field) {
      case 'status':
         return item.status.id === value.status.id;
      case 'priority':
         return item.priority.id === value.priority.id;
      case 'assignee':
         return (item.assignee?.id ?? null) === (value.assignee?.id ?? null);
      case 'project':
         return (item.project?.id ?? null) === (value.project?.id ?? null);
   }
}

export function canDropInto(item: Issue, target: IssueGroupContext): boolean {
   return inGroup(item, target) || target.group.drop !== undefined;
}

/**
 * Decide o que um drop faz (R2), ciente do agrupamento e da ordenação:
 * - mesmo grupo → reorder pelos vizinhos na ordem de RANK (a que o servidor grava). Em
 *   ordenação diferente de `manual`, a posição de rank não é a exibida: a view passa para
 *   `manual` (como o Linear) para o resultado ficar visível.
 * - outro grupo → muda o campo do agrupamento (`group.drop`) ou é recusado.
 * `targetIssueId` null = drop na área vazia do grupo (coluna vazia incluída).
 */
export function planIssueDrop({
   item,
   target,
   targetIssueId,
   dropAbove,
   ordering,
}: {
   item: Issue;
   target: IssueGroupContext;
   targetIssueId: string | null;
   dropAbove: boolean;
   ordering: OrderingKey;
}): IssueDropPlan {
   if (!inGroup(item, target)) {
      const { drop, subDrop } = target.group;
      if (!drop) return { kind: 'none' };
      // Sub-grupo/swimlane: muda também a 2ª dimensão (ex.: outra swimlane → assignee).
      // Sub-grupo sem campo de destino (label) só move no grupo principal.
      if (subDrop && !issueHasValue(item, subDrop)) {
         return { kind: 'move', value: drop, subValue: subDrop };
      }
      // Já no grupo principal e sem 2ª dimensão a mudar: não há o que gravar.
      if (issueHasValue(item, drop)) return { kind: 'none' };
      return { kind: 'move', value: drop };
   }
   if (!targetIssueId || targetIssueId === item.id) return { kind: 'none' };
   const list = target.issues.filter((i) => i.id !== item.id).sort(byRank);
   const idx = list.findIndex((i) => i.id === targetIssueId);
   if (idx === -1) return { kind: 'none' };
   const beforeId = dropAbove ? (list[idx - 1]?.id ?? null) : targetIssueId;
   const afterId = dropAbove ? targetIssueId : (list[idx + 1]?.id ?? null);
   return { kind: 'reorder', beforeId, afterId, switchToManual: ordering !== 'manual' };
}

function currentOrdering(viewKey: string): OrderingKey {
   return getViewDisplaySettings(useDisplaySettingsStore.getState().byView, viewKey).ordering;
}

function applyPlan(plan: IssueDropPlan, item: Issue, viewKey: string) {
   const store = useIssuesStore.getState();
   const quiet = (p: Promise<void>) => void p.catch(() => undefined); // o store já avisa o erro
   switch (plan.kind) {
      case 'none':
         return;
      case 'reorder':
         if (plan.switchToManual) useDisplaySettingsStore.getState().setOrdering(viewKey, 'manual');
         store.reorderIssue(item.id, plan.beforeId, plan.afterId);
         return;
      case 'move': {
         const apply = (value: GroupDropValue) => {
            switch (value.field) {
               case 'status':
                  return quiet(store.updateIssueStatus(item.id, value.status));
               case 'priority':
                  return quiet(store.updateIssuePriority(item.id, value.priority));
               case 'assignee':
                  return quiet(store.updateIssueAssignee(item.id, value.assignee));
               case 'project':
                  return quiet(store.updateIssueProject(item.id, value.project));
               default: {
                  const exhaustive: never = value;
                  return exhaustive;
               }
            }
         };
         // Entre swimlanes da mesma coluna o campo principal já bate: só o da 2ª dimensão.
         if (!plan.subValue || !issueHasValue(item, plan.value)) apply(plan.value);
         if (plan.subValue) apply(plan.subValue);
         return;
      }
   }
}

/** Pointer acima da metade de cima do alvo → solta antes dele. */
function pointerAbove(
   ref: RefObject<HTMLElement | null>,
   monitor: { getClientOffset(): { y: number } | null }
) {
   const rect = ref.current?.getBoundingClientRect();
   const pointerY = monitor.getClientOffset()?.y ?? 0;
   return rect ? pointerY < rect.top + rect.height / 2 : false;
}

/**
 * Drop sobre um card/linha: reorder no grupo ou move para o grupo do alvo. `isOver`/
 * `dropAbove` (is#21) alimentam a linha de inserção de 2px na lista — órfãos enquanto
 * ninguém arrasta sobre o alvo.
 */
export function useIssueDropTarget(
   issueId: string,
   getGroup: () => IssueGroupContext,
   ref: RefObject<HTMLElement | null>
) {
   const viewKey = useViewKey();
   const [{ isOver, dropAbove }, drop] = useDrop<
      Issue,
      IssueDropResult,
      { isOver: boolean; dropAbove: boolean }
   >(
      () => ({
         accept: IssueDragType,
         canDrop: (item) => canDropInto(item, getGroup()),
         drop(item, monitor) {
            const dropAbove = pointerAbove(ref, monitor);
            const plan = planIssueDrop({
               item,
               target: getGroup(),
               targetIssueId: issueId,
               dropAbove,
               ordering: currentOrdering(viewKey),
            });
            applyPlan(plan, item, viewKey);
            return { handled: true };
         },
         collect: (monitor) => {
            const over = monitor.isOver() && monitor.canDrop();
            return { isOver: over, dropAbove: over && pointerAbove(ref, monitor) };
         },
      }),
      [issueId, getGroup, viewKey, ref]
   );
   return { drop, isOver, dropAbove };
}

/** Drop na área do grupo (coluna do board, header da lista), inclusive grupo vazio. */
export function useGroupDropTarget(getGroup: () => IssueGroupContext) {
   const viewKey = useViewKey();
   return useDrop<Issue, void, { isOver: boolean }>(
      () => ({
         accept: IssueDragType,
         canDrop: (item) => !inGroup(item, getGroup()) && getGroup().group.drop !== undefined,
         drop(item, monitor) {
            // Um card já tratou (reorder/move): o container não repete.
            if (monitor.didDrop()) return;
            const plan = planIssueDrop({
               item,
               target: getGroup(),
               targetIssueId: null,
               dropAbove: false,
               ordering: currentOrdering(viewKey),
            });
            applyPlan(plan, item, viewKey);
         },
         collect: (monitor) => ({ isOver: monitor.isOver() && monitor.canDrop() }),
      }),
      [getGroup, viewKey]
   );
}
