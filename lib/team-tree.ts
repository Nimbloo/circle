/**
 * Árvore de sub-times para a UI (#100). Módulo PURO (sem React, sem drizzle) para
 * ser testável e reusável pela sidebar e pelos breadcrumbs.
 */
import type { Team } from '@/data/teams';

export interface TeamNode {
   team: Team;
   children: TeamNode[];
}

/** Teto de profundidade: dado corrompido (ciclo) não pode travar a renderização. */
const MAX_DEPTH = 32;

/**
 * Monta a árvore sobre o subconjunto `teams` recebido. O pai de um time é o
 * ancestral mais próximo QUE ESTÁ no subconjunto — assim um sub-time cujo pai o
 * usuário não participa aparece pendurado no avô (ou na raiz, se nenhum ancestral
 * estiver presente). `allTeams` fornece os elos que faltam no subconjunto. Ordena
 * por nome em cada nível.
 */
export function buildTeamTree(teams: Team[], allTeams: Team[] = teams): TeamNode[] {
   const byId = new Map(teams.map((t) => [t.id, t]));
   const parentOf = new Map(allTeams.map((t) => [t.id, t.parentId]));
   const nodes = new Map<string, TeamNode>(teams.map((t) => [t.id, { team: t, children: [] }]));
   const roots: TeamNode[] = [];

   for (const team of teams) {
      // Sobe até achar um ancestral presente no subconjunto (ou a raiz).
      let parentId = team.parentId;
      for (let depth = 0; parentId && !byId.has(parentId) && depth < MAX_DEPTH; depth++) {
         parentId = parentOf.get(parentId) ?? null;
      }
      const parent = parentId && parentId !== team.id ? nodes.get(parentId) : undefined;
      if (parent) parent.children.push(nodes.get(team.id)!);
      else roots.push(nodes.get(team.id)!);
   }

   const sortDeep = (list: TeamNode[]) => {
      list.sort((a, b) => a.team.name.localeCompare(b.team.name));
      list.forEach((n) => sortDeep(n.children));
   };
   sortDeep(roots);
   return roots;
}

/**
 * Caminho do time no breadcrumb, da raiz até ele ("Pai › Sub"). Usa TODOS os times
 * conhecidos, não só os do usuário.
 */
export function teamBreadcrumb(teams: Team[], teamId: string): Team[] {
   const byId = new Map(teams.map((t) => [t.id, t]));
   const path: Team[] = [];
   let cur = byId.get(teamId);
   for (let depth = 0; cur && depth < MAX_DEPTH; depth++) {
      if (path.some((t) => t.id === cur!.id)) break; // ciclo em dado legado
      path.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
   }
   return path;
}

/** Ids de `teamId` e de todos os seus sub-times (para filtros locais). */
export function teamWithDescendants(teams: Team[], teamId: string): string[] {
   const out = new Set<string>([teamId]);
   for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const before = out.size;
      for (const t of teams) if (t.parentId && out.has(t.parentId)) out.add(t.id);
      if (out.size === before) break;
   }
   return [...out];
}
