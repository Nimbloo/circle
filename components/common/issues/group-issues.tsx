'use client';

import { Issue } from '@/data/issues';
import { Status } from '@/data/status';
import { useViewStore } from '@/store/view-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { FC, ReactNode, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'motion/react';
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
                     <p className="text-sm font-medium text-center">Move to {group.name}</p>
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
                     <IssueGrid issue={issue} getGroup={getGroup} layout={false} />
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
   const getGroup = useGroupGetter(group, issues);

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
                     // is#24: o "+" pré-preenche o campo da coluna (status/priority/
                     // assignee/project) — antes só status funcionava.
                     openModal(group.drop);
                  }}
               >
                  <Plus className="size-4" />
               </Button>
            </div>
         </div>

         {viewType === 'list' ? (
            <div className="space-y-0">
               {issues.map((issue) => (
                  <IssueLine key={issue.id} issue={issue} getGroup={getGroup} layoutId={true} />
               ))}
            </div>
         ) : (
            <IssueGridList issues={issues} group={group} />
         )}
      </div>
   );
}
