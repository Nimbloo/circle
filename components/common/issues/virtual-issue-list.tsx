'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Issue } from '@/data/issues';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { IssueLine } from './issue-line';
import type { IssueGroupContext, IssueGroupDescriptor } from './group-issues';
import { useGroupDropTarget } from './use-issue-drop-target';
import { isKeyNavBlocked, navDirectionOf } from '@/store/issue-navigation-store';
import { useViewKey } from '@/lib/view-key';
import { LeavingGhosts, useListMotion } from '@/lib/list-motion';
import { MOTION_MS } from '@/lib/motion';

/**
 * Offset do scroll por view (is#14): abrir uma issue e voltar recomeçava a lista do topo.
 * Fica em memória do módulo — é estado de sessão, não persiste.
 */
const scrollOffsets = new Map<string, number>();

interface Entry {
   group: IssueGroupDescriptor;
   issues: Issue[];
   /** Sub-grupos (Display → Sub-grouping), já sem os vazios. Ausente = sem sub-grupo. */
   subgroups?: Entry[];
}

type GroupGetter = () => IssueGroupContext;

/** Linha virtual: um header de grupo OU uma issue. */
type Row =
   | {
        kind: 'header';
        group: IssueGroupDescriptor;
        count: number;
        open: boolean;
        getGroup: GroupGetter;
     }
   | {
        kind: 'subheader';
        group: IssueGroupDescriptor;
        count: number;
        open: boolean;
        getGroup: GroupGetter;
     }
   | { kind: 'issue'; groupId: string; issue: Issue; getGroup: GroupGetter };

export const ISSUE_GROUP_HEADER_HEIGHT = 36;
export const ISSUE_ROW_HEIGHT = 44;

/**
 * Chave da linha pela issue (não pelo índice): ao reordenar, a linha montada — e um popover
 * aberto nela — continua ligada à mesma issue. O grupo entra na chave porque, por label, a
 * mesma issue aparece em mais de um grupo.
 */
const rowKey = (row: Row) =>
   row.kind === 'issue' ? `issue:${row.groupId}:${row.issue.id}` : `${row.kind}:${row.group.id}`;

/**
 * Header do grupo: colapsável (como no Linear) e alvo de drop — grupo vazio (show empty
 * groups) aceita issue.
 */
function GroupHeader({
   group,
   count,
   open,
   getGroup,
   onToggle,
}: {
   group: IssueGroupDescriptor;
   count: number;
   open: boolean;
   getGroup: GroupGetter;
   onToggle: (id: string) => void;
}) {
   const ref = useRef<HTMLButtonElement>(null);
   const [{ isOver }, drop] = useGroupDropTarget(getGroup);
   drop(ref);
   return (
      <button
         ref={ref}
         type="button"
         aria-expanded={open}
         onClick={() => onToggle(group.id)}
         className={cn(
            'mx-2 flex h-9 w-[calc(100%-1rem)] items-center gap-2 rounded-lg bg-muted px-2 text-left',
            isOver && 'ring-1 ring-primary'
         )}
      >
         <ChevronRight
            className={cn(
               'size-3.5 text-muted-foreground transition-transform',
               open && 'rotate-90'
            )}
            aria-hidden
         />
         {group.icon}
         <span className="text-[13px] font-medium">{group.name}</span>
         <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </button>
   );
}

/** Header do sub-grupo: recuado, colapsável e alvo de drop (muda grupo e sub-grupo). */
function SubGroupHeader({
   group,
   count,
   open,
   getGroup,
   onToggle,
}: {
   group: IssueGroupDescriptor;
   count: number;
   open: boolean;
   getGroup: GroupGetter;
   onToggle: (id: string) => void;
}) {
   const ref = useRef<HTMLButtonElement>(null);
   const [{ isOver }, drop] = useGroupDropTarget(getGroup);
   drop(ref);
   return (
      <button
         ref={ref}
         type="button"
         aria-expanded={open}
         onClick={() => onToggle(group.id)}
         className={cn(
            'ml-8 mr-2 flex h-9 w-[calc(100%-2.5rem)] items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-accent/40',
            isOver && 'ring-1 ring-primary'
         )}
      >
         <ChevronRight
            className={cn(
               'size-3.5 text-muted-foreground transition-transform',
               open && 'rotate-90'
            )}
            aria-hidden
         />
         {group.icon}
         <span className="text-[13px] font-medium">{group.name}</span>
         <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </button>
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

   // Grupos e sub-grupos recolhidos (estado de sessão; o id do sub-grupo é composto
   // `grupo::sub-grupo`, então não colide com o do grupo).
   const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
   const toggleGroup = useCallback(
      (id: string) =>
         setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
         }),
      []
   );

   const rows = useMemo<Row[]>(() => {
      const out: Row[] = [];
      const byId = new Map<string, IssueGroupContext>();
      const pushIssues = (e: Entry, getGroup: GroupGetter) => {
         for (const issue of e.issues)
            out.push({ kind: 'issue', groupId: e.group.id, issue, getGroup });
      };
      for (const e of entries) {
         byId.set(e.group.id, e);
         const getGroup = getterFor(e.group.id);
         const groupOpen = !collapsed.has(e.group.id);
         out.push({
            kind: 'header',
            group: e.group,
            count: e.issues.length,
            open: groupOpen,
            getGroup,
         });
         if (!groupOpen) {
            // Recolhido: os sub-grupos continuam conhecidos para o drop, mas sem linhas.
            for (const sub of e.subgroups ?? []) byId.set(sub.group.id, sub);
            continue;
         }
         if (!e.subgroups) {
            pushIssues(e, getGroup);
            continue;
         }
         // Grupos e sub-grupos achatados numa lista só: a virtualização segue intacta.
         for (const sub of e.subgroups) {
            byId.set(sub.group.id, sub);
            const subGetter = getterFor(sub.group.id);
            const open = !collapsed.has(sub.group.id);
            out.push({
               kind: 'subheader',
               group: sub.group,
               count: sub.issues.length,
               open,
               getGroup: subGetter,
            });
            if (open) pushIssues(sub, subGetter);
         }
      }
      groupsById.current = byId;
      return out;
   }, [entries, getterFor, collapsed]);

   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (i) =>
         rows[i].kind === 'issue' ? ISSUE_ROW_HEIGHT : ISSUE_GROUP_HEADER_HEIGHT,
      getItemKey: (i) => rowKey(rows[i]),
      overscan: 14,
   });

   // Guarda e restaura a posição do scroll desta view.
   const viewKey = useViewKey();

   // Realtime: a issue que chega entra com fade e as vizinhas deslizam até o lugar novo.
   // Recolher/abrir grupo e trocar de view não animam (o `resetKey` muda junto).
   const rowKeys = useMemo(() => rows.map(rowKey), [rows]);
   const listMotion = useListMotion(rowKeys, `${viewKey}|${[...collapsed].join(',')}`);
   // Issue que sai (lote pequeno): o último desenho dela fecha a altura (`.list-exit`)
   // enquanto as de baixo sobem. Fica fora do virtualizer — não entra na contagem nem na
   // altura total, é só um div absoluto sem eventos por ~160 ms.
   const ghostsRef = useRef<LeavingGhosts<{ issue: Issue; start: number }> | null>(null);
   ghostsRef.current ??= new LeavingGhosts();
   const ghosts = ghostsRef.current.begin(listMotion);
   // Um render depois da janela tira os fantasmas do DOM.
   const [, sweep] = useState(0);
   const hasGhosts = ghosts.length > 0;
   useEffect(() => {
      if (!hasGhosts) return;
      const timer = setTimeout(() => sweep((n) => n + 1), MOTION_MS.modal + 120);
      return () => clearTimeout(timer);
   }, [hasGhosts, listMotion.version]);
   const restored = useRef(false);
   const rowCount = rows.length;
   useEffect(() => {
      restored.current = false;
   }, [viewKey]);
   useEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      // Só dá para restaurar quando já há linhas (antes disso o scroll é preso em 0).
      if (!restored.current && rowCount > 0) {
         restored.current = true;
         const saved = scrollOffsets.get(viewKey);
         if (saved) el.scrollTop = saved;
      }
      const onScroll = () => scrollOffsets.set(viewKey, el.scrollTop);
      el.addEventListener('scroll', onScroll, { passive: true });
      return () => el.removeEventListener('scroll', onScroll);
   }, [viewKey, rowCount]);

   // J/K (#33): cursor de teclado pelas linhas de issue; Enter abre a issue do cursor.
   const [activeKey, setActiveKey] = useState<string | null>(null);
   const rowsRef = useRef(rows);
   rowsRef.current = rows;
   const activeKeyRef = useRef(activeKey);
   activeKeyRef.current = activeKey;
   const scrollToIndex = virtualizer.scrollToIndex;
   useEffect(() => {
      const keyOf = (row: Row) =>
         row.kind === 'issue' ? `issue:${row.groupId}:${row.issue.id}` : null;
      const onKey = (e: KeyboardEvent) => {
         if (e.key === 'Enter') {
            if (!activeKeyRef.current || isKeyNavBlocked(e)) return;
            const link = parentRef.current?.querySelector<HTMLAnchorElement>(
               '[data-active="true"] a[href]'
            );
            if (!link) return;
            e.preventDefault();
            link.click();
            return;
         }
         const dir = navDirectionOf(e);
         if (!dir) return;
         const list = rowsRef.current;
         const issueIdx = list.flatMap((row, i) => (row.kind === 'issue' ? [i] : []));
         if (issueIdx.length === 0) return;
         e.preventDefault();
         const at = issueIdx.findIndex((i) => keyOf(list[i]) === activeKeyRef.current);
         const nextPos = at === -1 ? (dir === 1 ? 0 : issueIdx.length - 1) : at + dir;
         const target = issueIdx[Math.max(0, Math.min(issueIdx.length - 1, nextPos))];
         const nextKey = keyOf(list[target]);
         activeKeyRef.current = nextKey; // teclas rápidas: a próxima já parte daqui
         setActiveKey(nextKey);
         scrollToIndex(target, { align: 'auto' });
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [scrollToIndex]);

   return (
      <div ref={parentRef} className="h-full overflow-y-auto pr-[5px] [scrollbar-gutter:stable]">
         <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {/* Antes das linhas vivas: quem sobe passa por cima do fantasma. */}
            {ghosts.map(({ key, value }) => (
               <div
                  key={`ghost:${key}`}
                  aria-hidden
                  data-ghost
                  className="list-exit list-exit-virtual"
                  style={{
                     position: 'absolute',
                     top: 0,
                     left: 0,
                     width: '100%',
                     transform: `translateY(${value.start}px)`,
                  }}
               >
                  <div>
                     <IssueLine issue={value.issue} />
                  </div>
               </div>
            ))}
            {virtualizer.getVirtualItems().map((vi) => {
               const row = rows[vi.index];
               const active = vi.key === activeKey;
               if (row.kind === 'issue')
                  ghostsRef.current!.remember(String(vi.key), {
                     issue: row.issue,
                     start: vi.start,
                  });
               return (
                  <div
                     key={vi.key}
                     data-index={vi.index}
                     data-active={active || undefined}
                     className={cn(
                        active && 'bg-accent/40',
                        listMotion.moving && 'list-move',
                        listMotion.entering.has(String(vi.key)) && 'list-enter'
                     )}
                     style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vi.start}px)`,
                     }}
                  >
                     {row.kind === 'header' ? (
                        <GroupHeader
                           group={row.group}
                           count={row.count}
                           open={row.open}
                           getGroup={row.getGroup}
                           onToggle={toggleGroup}
                        />
                     ) : row.kind === 'subheader' ? (
                        <SubGroupHeader
                           group={row.group}
                           count={row.count}
                           open={row.open}
                           getGroup={row.getGroup}
                           onToggle={toggleGroup}
                        />
                     ) : (
                        <IssueLine issue={row.issue} getGroup={row.getGroup} />
                     )}
                  </div>
               );
            })}
         </div>
      </div>
   );
}
