'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Issue } from '@/data/issues';
import { cn } from '@/lib/utils';
import { IssueLine } from './issue-line';
import type { IssueGroupContext, IssueGroupDescriptor } from './group-issues';
import { useGroupDropTarget } from './use-issue-drop-target';

interface Entry {
   group: IssueGroupDescriptor;
   issues: Issue[];
}

type GroupGetter = () => IssueGroupContext;

/** Linha virtual: um header de grupo OU uma issue. */
type Row =
   | { kind: 'header'; group: IssueGroupDescriptor; count: number; getGroup: GroupGetter }
   | { kind: 'issue'; groupId: string; issue: Issue; getGroup: GroupGetter };

export const ISSUE_GROUP_HEADER_HEIGHT = 36;
export const ISSUE_ROW_HEIGHT = 44;

/** Header do grupo: também é alvo de drop — grupo vazio (show empty groups) aceita issue. */
function GroupHeader({
   group,
   count,
   getGroup,
}: {
   group: IssueGroupDescriptor;
   count: number;
   getGroup: GroupGetter;
}) {
   const ref = useRef<HTMLDivElement>(null);
   const [{ isOver }, drop] = useGroupDropTarget(getGroup);
   drop(ref);
   return (
      <div
         ref={ref}
         className={cn(
            'mx-2 flex h-9 items-center gap-2 rounded-lg bg-muted px-2',
            isOver && 'ring-1 ring-primary'
         )}
      >
         {group.icon}
         <span className="text-[13px] font-medium">{group.name}</span>
         <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
   );
}

/**
 * List view VIRTUALIZADA (estilo Linear): achata [header, ...rows, header, ...] numa
 * lista única e só renderiza as linhas VISÍVEIS (@tanstack/react-virtual). Com centenas/
 * milhares de issues, o DOM fica constante (~janela + overscan) em vez de crescer linear —
 * scroll fluido e sem travar a main thread. Alturas fixas (36/44px) → sem medição.
 * Headers NÃO são sticky aqui (simplicidade; o agrupamento segue visível ao rolar).
 */
export function VirtualIssueList({ entries }: { entries: Entry[] }) {
   const parentRef = useRef<HTMLDivElement>(null);
   // Getter ESTÁVEL por grupo (lê grupo e ordem atuais no drop): passar o array do grupo
   // mudava a prop de todas as linhas a cada evento e derrubava o `memo` da `IssueLine`.
   const groupsById = useRef(new Map<string, IssueGroupContext>());
   const getters = useRef(new Map<string, GroupGetter>());
   const getterFor = useCallback((groupId: string) => {
      let getter = getters.current.get(groupId);
      if (!getter) {
         getter = () =>
            groupsById.current.get(groupId) ?? {
               group: { id: groupId, name: '', icon: null },
               issues: [],
            };
         getters.current.set(groupId, getter);
      }
      return getter;
   }, []);

   const rows = useMemo<Row[]>(() => {
      const out: Row[] = [];
      groupsById.current = new Map(entries.map((e) => [e.group.id, e]));
      for (const e of entries) {
         const getGroup = getterFor(e.group.id);
         out.push({ kind: 'header', group: e.group, count: e.issues.length, getGroup });
         for (const issue of e.issues)
            out.push({ kind: 'issue', groupId: e.group.id, issue, getGroup });
      }
      return out;
   }, [entries, getterFor]);

   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (i) =>
         rows[i].kind === 'header' ? ISSUE_GROUP_HEADER_HEIGHT : ISSUE_ROW_HEIGHT,
      // Chave pela issue (não pelo índice): ao reordenar, a linha montada — e um popover
      // aberto nela — continua ligada à mesma issue. O grupo entra na chave porque, por
      // label, a mesma issue aparece em mais de um grupo.
      getItemKey: (i) => {
         const row = rows[i];
         return row.kind === 'header'
            ? `header:${row.group.id}`
            : `issue:${row.groupId}:${row.issue.id}`;
      },
      overscan: 14,
   });

   return (
      <div ref={parentRef} className="h-full overflow-y-auto pr-[5px] [scrollbar-gutter:stable]">
         <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
               const row = rows[vi.index];
               return (
                  <div
                     key={vi.key}
                     data-index={vi.index}
                     style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                     }}
                  >
                     {row.kind === 'header' ? (
                        <GroupHeader group={row.group} count={row.count} getGroup={row.getGroup} />
                     ) : (
                        // layoutId=false: sem animação de layout do framer-motion (brigaria
                        // com o mount/unmount da virtualização).
                        <IssueLine issue={row.issue} getGroup={row.getGroup} layoutId={false} />
                     )}
                  </div>
               );
            })}
         </div>
      </div>
   );
}
