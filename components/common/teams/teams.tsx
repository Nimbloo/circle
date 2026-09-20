'use client';

import { useWorkspaceStore } from '@/store/workspace-store';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
import { useTeamsFilterStore } from '@/store/team-filter-store';
import { useTeamsDisplayStore } from '@/store/teams-display-store';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildTeamTree, type TeamNode } from '@/lib/team-tree';
import { Filter } from '@/components/layout/headers/teams/filter';
import TeamLine from './team-line';
import { TeamsDisplayOptions } from './teams-display-options';
import { NewTeamButton } from './new-team-button';
import { ViewBar } from '@/components/layout/header-primitives';

/** Um time e, aninhados, os sub-times dele (recursivo). */
function TeamTreeRows({
   node,
   depth,
   collapsed,
   toggle,
}: {
   node: TeamNode;
   depth: number;
   collapsed: Record<string, boolean>;
   toggle: (id: string) => void;
}) {
   const hasChildren = node.children.length > 0;
   const expanded = hasChildren && !collapsed[node.team.id];
   const row = (
      <TeamLine
         team={node.team}
         depth={depth}
         hasChildren={hasChildren}
         expanded={expanded}
         onToggle={() => toggle(node.team.id)}
      />
   );
   if (!hasChildren) return row;
   return (
      <div role="group" aria-label={node.team.name}>
         {row}
         {expanded &&
            node.children.map((child) => (
               <TeamTreeRows
                  key={child.team.id}
                  node={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  toggle={toggle}
               />
            ))}
      </div>
   );
}

export default function Teams() {
   const allTeams = useWorkspaceStore((s) => s.teams);
   const projects = useWorkspaceStore((s) => s.projects);
   const loaded = useWorkspaceStore((s) => s.loaded);
   const { filters } = useTeamsFilterStore();
   const { ordering, displayProperties } = useTeamsDisplayStore();
   /** Sub-times escondidos por time (colapso local da tela). */
   const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

   const displayed = useMemo(() => {
      let list = allTeams.slice();

      if (filters.membership.length > 0) {
         const selectedMembership = new Set(filters.membership);
         list = list.filter((team) =>
            selectedMembership.has(team.joined ? 'Joined' : 'Not-Joined')
         );
      }
      if (filters.identifier.length > 0) {
         const selectedIdentifiers = new Set(filters.identifier);
         list = list.filter((team) => selectedIdentifiers.has(team.id));
      }

      // Projetos por time derivados de `projects` (o bootstrap não traz `teams[].projects`).
      const projectCount = new Map<string, number>();
      for (const p of projects) projectCount.set(p.teamId, (projectCount.get(p.teamId) ?? 0) + 1);
      const compare = (a: (typeof list)[number], b: (typeof list)[number]) => {
         switch (ordering) {
            case 'members':
               return b.members.length - a.members.length;
            case 'projects':
               return (projectCount.get(b.id) ?? 0) - (projectCount.get(a.id) ?? 0);
            case 'name':
            default:
               return a.name.localeCompare(b.name);
         }
      };
      return list.sort(compare);
   }, [allTeams, projects, filters, ordering]);

   // Sub-times aninhados (paridade Linear): a árvore é montada sobre a lista já
   // filtrada/ordenada; um sub-time cujo pai saiu no filtro sobe pro ancestral presente.
   const tree = useMemo(() => {
      const order = new Map(displayed.map((t, i) => [t.id, i]));
      const nodes = buildTeamTree(displayed, allTeams);
      const sortDeep = (list: TeamNode[]) => {
         list.sort((a, b) => (order.get(a.team.id) ?? 0) - (order.get(b.team.id) ?? 0));
         list.forEach((n) => sortDeep(n.children));
      };
      sortDeep(nodes);
      return nodes;
   }, [displayed, allTeams]);

   return (
      <div className="w-full">
         {/* Count + view controls (Linear-style) */}
         <ViewBar className="pl-2 pr-2.5">
            <span className="translate-y-[0.5px] pl-2.5 text-[13px] font-medium leading-[normal] text-muted-foreground">
               {displayed.length} {displayed.length === 1 ? 'team' : 'teams'}
            </span>
            {/* "New team" vive no header da página (headers/teams/header-nav) — não duplicar
                aqui no toolbar da lista (era o 2º botão idêntico que o usuário via). */}
            <div className="flex translate-y-[0.5px] items-center gap-1.5">
               <Filter />
               <TeamsDisplayOptions />
            </div>
         </ViewBar>

         {/* Column headers */}
         <div className="h-8 pl-[18px] pr-[34px] flex items-center border-b border-border/40 text-xs font-[450] leading-[normal] text-[var(--table-header-foreground)]">
            <div className="flex-1 min-w-0">Name</div>
            {displayProperties.membership && (
               <div className="hidden w-[96px] shrink-0 sm:block">Membership</div>
            )}
            {displayProperties.owners && (
               <div className="hidden lg:block w-[70px] shrink-0">Owners</div>
            )}
            {displayProperties.members && <div className="w-[126px] shrink-0">Members</div>}
            {displayProperties.cycle && (
               <div className="hidden w-[88px] shrink-0 md:block">Cycle</div>
            )}
            {displayProperties.projects && (
               <div className="hidden w-[154px] shrink-0 sm:block">Projects</div>
            )}
         </div>

         <div className="w-full">
            {displayed.length === 0 && !loaded ? (
               // Hidratando → loading; "No teams yet" só depois do workspace chegar.
               <div className="py-4">
                  <LoadingArea rows={4} />
               </div>
            ) : displayed.length === 0 ? (
               filters.membership.length > 0 || filters.identifier.length > 0 ? (
                  <EmptyState
                     variant="filtered"
                     title="No teams match your filters"
                     description="Try clearing or adjusting the filters above."
                  />
               ) : (
                  <EmptyState
                     icon={Users}
                     title="No teams yet"
                     description="Teams organize issues, cycles and projects around the people working together."
                     action={<NewTeamButton />}
                  />
               )
            ) : (
               <div className="content-enter">
                  {tree.map((node) => (
                     <TeamTreeRows
                        key={node.team.id}
                        node={node}
                        depth={0}
                        collapsed={collapsed}
                        toggle={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                     />
                  ))}
               </div>
            )}
         </div>
      </div>
   );
}
