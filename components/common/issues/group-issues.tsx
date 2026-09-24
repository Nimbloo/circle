'use client';

import { Issue } from '@/data/issues';
import { Status } from '@/data/status';
import { useViewStore } from '@/store/view-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { FC, ReactNode, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useListMotion, useMoveGate } from '@/lib/list-motion';
import { useViewKey } from '@/lib/view-key';
import { Button } from '../../ui/button';
import { IssueGrid } from './issue-grid';
import { IssueLine } from './issue-line';
import { useGroupDropTarget, type GroupDropValue } from './use-issue-drop-target';

/**
 * Generic descriptor of an issue group. Groups are usually statuses but the
 * "Display" settings also allow grouping by assignee / priority / project.
 */
export interface IssueGroupDescriptor {
   id: string;
   name: string;
   icon: ReactNode;
   /** Set when grouping by status: "+" default status. */
   status?: Status;
   /** Campo aplicado à issue solta neste grupo vinda de outro. Ausente = drop recusado. */
   drop?: GroupDropValue;
   /** Sub-grupo (lista) / swimlane (board): campo da 2ª dimensão, aplicado junto do `drop`. */
   subDrop?: GroupDropValue;
}

/** Grupo + suas issues na ordem exibida — lido no momento do drop (getter estável). */
export interface IssueGroupContext {
   group: IssueGroupDescriptor;
   issues: Issue[];
}

interface GroupIssuesProps {
   group: IssueGroupDescriptor;
   /** Issues of the group, already sorted upstream. */
   issues: Issue[];
   count: number;
}

/**
 * Coluna do board VIRTUALIZADA (@tanstack/react-virtual): só os cards visíveis
 * (+ overscan) vão pro DOM — coluna com centenas de issues fica fluida e o DOM
 * constante. Altura medida dinamicamente (cards variam com título/labels). O
 * overscan generoso (8) preserva o drop-target do DnD nas bordas do scroll.
 */
/** Getter estável do grupo: cards/linhas leem grupo e ordem atuais no drop sem receber
 *  um array novo (que derrubaria o `memo`) a cada mudança do grupo. */
export function useGroupGetter(group: IssueGroupDescriptor, issues: Issue[]) {
   const latest = useRef<IssueGroupContext>({ group, issues });
   latest.current = { group, issues };
   return useCallback(() => latest.current, []);
}

const IssueGridList: FC<{ issues: Issue[]; group: IssueGroupDescriptor }> = ({ issues, group }) => {
   const ref = useRef<HTMLDivElement>(null);
   const getGroup = useGroupGetter(group, issues);

   // Drop na área da coluna (fora de um card, ou coluna vazia) → campo do grupo.
   const [{ isOver }, drop] = useGroupDropTarget(getGroup);
   drop(ref);

   const virtualizer = useVirtualizer({
      count: issues.length,
      getScrollElement: () => ref.current,
      estimateSize: () => 132, // altura típica do card (título + labels + footer)
      overscan: 8,
      // Medição e card presos à issue, não ao índice (reordenar não troca a altura/estado).
      getItemKey: (i) => issues[i].id,
   });

   // Realtime: card que chega (criado, arrastado por alguém, mudou de status) entra com
   // fade e os vizinhos deslizam; carga, troca de view e lote não animam.
   const viewKey = useViewKey();
   const issueIds = useMemo(() => issues.map((issue) => issue.id), [issues]);
   const listMotion = useListMotion(issueIds, `${viewKey}|${group.id}`);
   // Re-medição de altura (imagem que carregou, label nova) não desliza de novo: só a
   // posição que veio da mudança de dados anima.
   const moveGate = useMoveGate(listMotion.version);

   return (
      <div
         ref={ref}
         className="relative h-full flex-1 overflow-y-auto pb-3 pl-[13px] pr-4 pt-[9px]"
      >
         {/* Dica de drop: entra com fade (CSS) e sai no drop, sem saída animada. */}
         {isOver && (
            <div
               className="content-enter fixed top-0 left-0 right-0 bottom-0 z-10 flex items-center justify-center pointer-events-none bg-background/90"
               style={{
                  width: ref.current?.getBoundingClientRect().width || '100%',
                  height: ref.current?.getBoundingClientRect().height || '100%',
                  transform: `translate(${ref.current?.getBoundingClientRect().left || 0}px, ${ref.current?.getBoundingClientRect().top || 0}px)`,
               }}
            >
               <div className="max-w-[90%] rounded-lg border border-border bg-card p-3 shadow-md">
                  <p className="text-sm font-medium text-center">Move to {group.name}</p>
               </div>
            </div>
         )}
         <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
               const issue = issues[vi.index];
               return (
                  <div
                     key={issue.id}
                     data-index={vi.index}
                     ref={virtualizer.measureElement}
                     className={cn(
                        moveGate.allow(issue.id, vi.start, listMotion.moving) && 'list-move',
                        listMotion.entering.has(issue.id) && 'list-enter'
                     )}
                     style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                        paddingBottom: 8, // gap entre cards (medido junto com a altura)
                     }}
                  >
                     <IssueGrid issue={issue} getGroup={getGroup} />
                  </div>
               );
            })}
         </div>
      </div>
   );
};

/** Cabeçalho do grupo (coluna do board / grupo da lista): ícone, nome, contagem e "+". */
export function GroupHeaderBar({
   group,
   count,
   isViewTypeGrid,
}: {
   group: IssueGroupDescriptor;
   count: number;
   isViewTypeGrid: boolean;
}) {
   const { openModal } = useCreateIssueStore();
   return (
      <div
         className={cn(
            'sticky top-0 z-10 w-full',
            isViewTypeGrid ? 'h-[50px] px-1 pt-1' : 'h-9 px-2'
         )}
      >
         {/* Header neutro (padrão Linear): só o ícone de status é colorido, sem tinta de fundo. */}
         <div
            className={cn(
               'flex h-full w-full items-center justify-between',
               isViewTypeGrid ? 'h-[46px] rounded-t-md bg-background/40 px-3.5' : ''
            )}
         >
            <div className="flex items-center gap-2">
               {group.icon}
               <span className="text-[13px] font-medium">{group.name}</span>
               <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </div>

            <Button
               className="size-6"
               size="icon"
               variant="ghost"
               aria-label={`Create issue in ${group.name}`}
               onClick={(e) => {
                  e.stopPropagation();
                  // is#24: o "+" pré-preenche o campo da coluna (status/priority/
                  // assignee/project) — antes só status funcionava.
                  openModal(group.drop);
               }}
            >
               <Plus className="size-4" />
            </Button>
         </div>
      </div>
   );
}

export function GroupIssues({ group, issues, count }: GroupIssuesProps) {
   const { viewType } = useViewStore();
   const isViewTypeGrid = viewType === 'grid';
   const getGroup = useGroupGetter(group, issues);

   return (
      <div
         className={cn(
            isViewTypeGrid ? 'flex h-full w-[348px] flex-shrink-0 flex-col overflow-hidden' : ''
         )}
      >
         <GroupHeaderBar group={group} count={count} isViewTypeGrid={isViewTypeGrid} />

         {viewType === 'list' ? (
            <div className="space-y-0">
               {issues.map((issue) => (
                  <IssueLine key={issue.id} issue={issue} getGroup={getGroup} />
               ))}
            </div>
         ) : (
            <IssueGridList issues={issues} group={group} />
         )}
      </div>
   );
}
