'use client';

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Issue } from '@/data/issues';
import { IssueLine } from './issue-line';
import type { IssueGroupDescriptor } from './group-issues';

interface Entry {
   group: IssueGroupDescriptor;
   issues: Issue[];
}

/** Linha virtual: um header de grupo OU uma issue. */
type Row =
   | { kind: 'header'; group: IssueGroupDescriptor; count: number }
   | { kind: 'issue'; issue: Issue };

const HEADER_H = 40; // group header (h-10)
const ROW_H = 40; // IssueLine (h-10) — densidade Linear

/**
 * List view VIRTUALIZADA (estilo Linear): achata [header, ...rows, header, ...] numa
 * lista única e só renderiza as linhas VISÍVEIS (@tanstack/react-virtual). Com centenas/
 * milhares de issues, o DOM fica constante (~janela + overscan) em vez de crescer linear —
 * scroll fluido e sem travar a main thread. Alturas fixas (40/44px) → sem medição.
 * Headers NÃO são sticky aqui (simplicidade; o agrupamento segue visível ao rolar).
 */
export function VirtualIssueList({ entries }: { entries: Entry[] }) {
   const parentRef = useRef<HTMLDivElement>(null);

   const rows = useMemo<Row[]>(() => {
      const out: Row[] = [];
      for (const e of entries) {
         out.push({ kind: 'header', group: e.group, count: e.issues.length });
         for (const issue of e.issues) out.push({ kind: 'issue', issue });
      }
      return out;
   }, [entries]);

   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (i) => (rows[i].kind === 'header' ? HEADER_H : ROW_H),
      overscan: 14,
   });

   return (
      <div ref={parentRef} className="h-full overflow-y-auto">
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
                        <div
                           className="w-full h-10 flex items-center px-6 gap-2 border-b border-border/40"
                           style={{ backgroundColor: `${row.group.color}0d` }}
                        >
                           {row.group.icon}
                           <span className="text-sm font-medium">{row.group.name}</span>
                           <span className="text-sm text-muted-foreground">{row.count}</span>
                        </div>
                     ) : (
                        // layoutId=false: sem animação de layout do framer-motion (brigaria
                        // com o mount/unmount da virtualização).
                        <IssueLine issue={row.issue} layoutId={false} />
                     )}
                  </div>
               );
            })}
         </div>
      </div>
   );
}
