'use client';

import { Issue } from '@/data/issues';
import { Status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useViewStore } from '@/store/view-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { FC, ReactNode, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../ui/button';
import { IssueDragType, IssueGrid } from './issue-grid';
import { IssueLine } from './issue-line';

/**
 * Generic descriptor of an issue group. Groups are usually statuses but the
 * "Display" settings also allow grouping by assignee / priority / project.
 */
export interface IssueGroupDescriptor {
   id: string;
   name: string;
   icon: ReactNode;
   /** Set when grouping by status: enables board drop + "+" default status. */
   status?: Status;
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
const IssueGridList: FC<{ issues: Issue[]; status?: Status }> = ({ issues, status }) => {
   const ref = useRef<HTMLDivElement>(null);
   const updateIssueStatus = useIssuesStore((s) => s.updateIssueStatus);

   // Drop na área da coluna (fora de um card) → muda o status para o do grupo.
   const [{ isOver }, drop] = useDrop(
      () => ({
         accept: IssueDragType,
         canDrop: () => status !== undefined,
         drop(item: Issue, monitor) {
            // Só trata quando NENHUM card tratou o drop (área vazia do grupo). Se um card
            // tratou (reorder ou status), `didDrop()` é true e o container não faz nada.
            if (status && !monitor.didDrop() && item.status.id !== status.id) {
               updateIssueStatus(item.id, status);
            }
         },
         collect: (monitor) => ({
            isOver: !!monitor.isOver() && !!monitor.canDrop(),
         }),
      }),
      [status, updateIssueStatus]
   );
   drop(ref);

   const virtualizer = useVirtualizer({
      count: issues.length,
      getScrollElement: () => ref.current,
      estimateSize: () => 132, // altura típica do card (título + labels + footer)
      overscan: 8,
   });

   return (
      <div
         ref={ref}
         className="relative h-full flex-1 overflow-y-auto pb-3 pl-[13px] pr-4 pt-[9px]"
      >
         <AnimatePresence>
            {isOver && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="fixed top-0 left-0 right-0 bottom-0 z-10 flex items-center justify-center pointer-events-none bg-background/90"
                  style={{
                     width: ref.current?.getBoundingClientRect().width || '100%',
                     height: ref.current?.getBoundingClientRect().height || '100%',
                     transform: `translate(${ref.current?.getBoundingClientRect().left || 0}px, ${ref.current?.getBoundingClientRect().top || 0}px)`,
                  }}
               >
                  <div className="max-w-[90%] rounded-lg border border-border bg-card p-3 shadow-md">
                     <p className="text-sm font-medium text-center">Drop to update status</p>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
         <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
               const issue = issues[vi.index];
               return (
                  <div
                     key={issue.id}
                     data-index={vi.index}
                     ref={virtualizer.measureElement}
                     style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                        paddingBottom: 8, // gap entre cards (medido junto com a altura)
                     }}
                  >
                     <IssueGrid issue={issue} orderedIssues={issues} layout={false} />
                  </div>
               );
            })}
         </div>
      </div>
   );
};

export function GroupIssues({ group, issues, count }: GroupIssuesProps) {
   const { viewType } = useViewStore();
   const isViewTypeGrid = viewType === 'grid';
   const { openModal } = useCreateIssueStore();

   return (
      <div
         className={cn(
            isViewTypeGrid ? 'flex h-full w-[348px] flex-shrink-0 flex-col overflow-hidden' : ''
         )}
      >
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
                     openModal(group.status);
                  }}
               >
                  <Plus className="size-4" />
               </Button>
            </div>
         </div>

         {viewType === 'list' ? (
            <div className="space-y-0">
               {issues.map((issue) => (
                  <IssueLine key={issue.id} issue={issue} orderedIssues={issues} layoutId={true} />
               ))}
            </div>
         ) : (
            <IssueGridList issues={issues} status={group.status} />
         )}
      </div>
   );
}
