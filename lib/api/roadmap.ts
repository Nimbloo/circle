/**
 * Roadmap (#102): os projetos do workspace agrupados por initiative, com os marcos,
 * as dependências e o estado de atraso de cada uma — tudo costurado no servidor para
 * a tela não recalcular por linha.
 *
 * Hierarquia (#100): as initiatives entram em ordem de árvore (mãe, depois filhas
 * indentadas por `depth`) e o progresso do cabeçalho é o ROLLUP da subárvore. Os
 * projetos sem initiative fecham a lista, como no Linear.
 */
import { inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   initiative as initT,
   project as projectT,
   projectMilestone,
   projectStatus as projectStatusT,
} from '@/db/schema';
import { listProjects, type ProjectDto } from './projects';
import { listAllDependencies } from './project-dependencies';
import {
   getAggregatedSnapshots,
   snapshotProjects,
   type ProjectSnapshotPoint,
} from './project-snapshots';
import { initiativeDescendantIds } from './hierarchy';

export interface RoadmapMilestone {
   id: string;
   projectId: string;
   name: string;
   targetDate: string;
   completed: boolean;
}

/**
 * Aresta desenhada no Roadmap. `late` = a dependência ameaça o dependente, com o
 * motivo em `reason`:
 *  - `overlap`: a dependência termina DEPOIS do início de quem depende dela;
 *  - `overdue`: a dependência passou do target e não foi concluída.
 */
export interface RoadmapDependency {
   projectId: string;
   dependsOnId: string;
   late: boolean;
   reason: 'overlap' | 'overdue' | null;
}

export interface RoadmapGroup {
   /** Id da initiative, ou `no-initiative` no grupo final. */
   id: string;
   name: string;
   icon: string | null;
   /** Profundidade na árvore de initiatives (0 = topo). */
   depth: number;
   parentId: string | null;
   /** Projetos ligados diretamente a esta initiative (já filtrados/ordenados). */
   projectIds: string[];
   /** Rollup da subárvore: projetos e concluídos, para o progresso do cabeçalho. */
   projectCount: number;
   completedProjectCount: number;
   percentComplete: number;
}

export interface RoadmapDto {
   groups: RoadmapGroup[];
   projects: ProjectDto[];
   milestones: RoadmapMilestone[];
   dependencies: RoadmapDependency[];
}

export interface RoadmapOptions {
   /** Escopo de times (#100, Guest). `[]` = nada visível. */
   teamIds?: string[];
   /** `false` esconde projetos concluídos/cancelados (Display "Show completed"). */
   includeCompleted?: boolean;
   /** Ordenação dentro de cada grupo. */
   sort?: 'start-date' | 'target-date' | 'title';
   /** "Hoje" injetável (testes). */
   now?: Date;
}

const CLOSED_CATEGORIES = new Set(['completed', 'canceled']);

/** `parentId -> filhas`, sobre todas as initiatives. */
function childrenByParent(edges: { id: string; parentId: string | null }[]) {
   const map = new Map<string, string[]>();
   for (const e of edges) {
      if (!e.parentId) continue;
      const arr = map.get(e.parentId);
      if (arr) arr.push(e.id);
      else map.set(e.parentId, [e.id]);
   }
   return map;
}

type InitiativeRow = { id: string; name: string; icon: string | null; parentId: string | null };

/**
 * Ordem de árvore: cada raiz seguida da sua subárvore, tudo alfabético por nome.
 * Initiative cujo pai não foi carregado (ou ciclo em dado legado) entra como raiz.
 */
function treeOrder(rows: InitiativeRow[]): { row: InitiativeRow; depth: number }[] {
   const byId = new Map(rows.map((r) => [r.id, r]));
   const children = childrenByParent(rows);
   const byName = (a: string, b: string) =>
      (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '');

   const out: { row: InitiativeRow; depth: number }[] = [];
   const seen = new Set<string>();
   const walk = (id: string, depth: number) => {
      const row = byId.get(id);
      if (!row || seen.has(id) || depth > 32) return;
      seen.add(id);
      out.push({ row, depth });
      for (const child of (children.get(id) ?? []).slice().sort(byName)) walk(child, depth + 1);
   };
   const roots = rows
      .filter((r) => !r.parentId || !byId.has(r.parentId))
      .map((r) => r.id)
      .sort(byName);
   for (const id of roots) walk(id, 0);
   // Sobra só se houver ciclo: entra como raiz para não sumir da tela.
   for (const row of rows) if (!seen.has(row.id)) walk(row.id, 0);
   return out;
}

/** Subárvore de `root` (incluindo ele), com teto contra ciclo. */
function subtree(children: Map<string, string[]>, root: string, limit: number): string[] {
   const seen = new Set<string>();
   const queue = [root];
   for (let steps = 0; queue.length > 0 && steps <= limit; steps++) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(children.get(id) ?? []));
   }
   return [...seen];
}

/**
 * Uma dependência está "late" quando ameaça o dependente: ou termina depois do início
 * dele (sobreposição), ou já passou do target sem ter sido concluída.
 */
function dependencyState(
   dependent: ProjectDto | undefined,
   dependency: ProjectDto | undefined,
   today: string,
   closedStatusIds: Set<string>
): { late: boolean; reason: 'overlap' | 'overdue' | null } {
   if (!dependent || !dependency) return { late: false, reason: null };
   const completed = closedStatusIds.has(dependency.status.id);
   if (!completed && dependency.targetDate && dependency.targetDate < today) {
      return { late: true, reason: 'overdue' };
   }
   if (
      !completed &&
      dependency.targetDate &&
      dependent.startDate &&
      dependency.targetDate > dependent.startDate
   ) {
      return { late: true, reason: 'overlap' };
   }
   return { late: false, reason: null };
}

export async function getRoadmap(db: Db, opts: RoadmapOptions = {}): Promise<RoadmapDto> {
   const now = opts.now ?? new Date();
   const today = now.toISOString().slice(0, 10);

   const projects = await listProjects(db, {
      teamIds: opts.teamIds,
      includeClosed: opts.includeCompleted === false ? false : undefined,
      sort: opts.sort ?? 'start-date',
   });
   const projectIds = projects.map((p) => p.id);
   const byId = new Map(projects.map((p) => [p.id, p]));

   // Snapshot lazy do dia (mesmo padrão do cycle): a visita ao roadmap alimenta o
   // histórico de progresso sem job.
   await snapshotProjects(db, projectIds, now);

   const [initiatives, milestoneRows, dependencyRows, projectStatuses] = await Promise.all([
      db
         .select({
            id: initT.id,
            name: initT.name,
            icon: initT.icon,
            parentId: initT.parentId,
         })
         .from(initT),
      projectIds.length
         ? db.select().from(projectMilestone).where(inArray(projectMilestone.projectId, projectIds))
         : Promise.resolve([]),
      listAllDependencies(db),
      db.select().from(projectStatusT),
   ]);

   const closedStatusIds = new Set(
      projectStatuses.filter((s) => CLOSED_CATEGORIES.has(s.category)).map((s) => s.id)
   );

   const directByInitiative = new Map<string, string[]>();
   const orphans: string[] = [];
   for (const p of projects) {
      if (p.initiativeId) {
         const arr = directByInitiative.get(p.initiativeId) ?? [];
         arr.push(p.id);
         directByInitiative.set(p.initiativeId, arr);
      } else {
         orphans.push(p.id);
      }
   }

   const children = childrenByParent(initiatives);
   const groups: RoadmapGroup[] = [];
   for (const { row, depth } of treeOrder(initiatives)) {
      const ids = subtree(children, row.id, initiatives.length + 1);
      // Rollup: união dos projetos da subárvore (um projeto conta uma vez só).
      const rollup = new Set<string>();
      for (const id of ids) for (const pid of directByInitiative.get(id) ?? []) rollup.add(pid);
      const direct = directByInitiative.get(row.id) ?? [];
      // Initiative sem nenhum projeto visível na subárvore não vira linha na tela.
      if (rollup.size === 0) continue;
      const completed = [...rollup].filter((pid) =>
         closedStatusIds.has(byId.get(pid)?.status.id ?? '')
      ).length;
      groups.push({
         id: row.id,
         name: row.name,
         icon: row.icon,
         depth,
         parentId: row.parentId,
         projectIds: direct,
         projectCount: rollup.size,
         completedProjectCount: completed,
         percentComplete: rollup.size === 0 ? 0 : Math.round((completed / rollup.size) * 100),
      });
   }

   if (orphans.length > 0) {
      const completed = orphans.filter((pid) =>
         closedStatusIds.has(byId.get(pid)?.status.id ?? '')
      ).length;
      groups.push({
         id: 'no-initiative',
         name: 'No initiative',
         icon: null,
         depth: 0,
         parentId: null,
         projectIds: orphans,
         projectCount: orphans.length,
         completedProjectCount: completed,
         percentComplete: Math.round((completed / orphans.length) * 100),
      });
   }

   // Marco sem data não tem onde ser desenhado na timeline — fica fora (o painel do
   // projeto continua listando todos).
   const milestones: RoadmapMilestone[] = milestoneRows
      .flatMap((m) =>
         m.targetDate
            ? [
                 {
                    id: m.id,
                    projectId: m.projectId,
                    name: m.name,
                    targetDate: m.targetDate,
                    completed: m.completed,
                 },
              ]
            : []
      )
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

   const dependencies: RoadmapDependency[] = dependencyRows
      // Só as arestas cujos dois lados estão visíveis (escopo de Guest e filtros).
      .filter((e) => byId.has(e.projectId) && byId.has(e.dependsOnId))
      .map((e) => ({
         projectId: e.projectId,
         dependsOnId: e.dependsOnId,
         ...dependencyState(byId.get(e.projectId), byId.get(e.dependsOnId), today, closedStatusIds),
      }));

   return { groups, projects, milestones, dependencies };
}

/**
 * Série de progresso agregada de uma initiative: soma os snapshots dos projetos da
 * SUBÁRVORE (a initiative-mãe agrega as filhas, como o rollup de projetos). Respeita
 * o escopo de times do usuário.
 */
export async function getInitiativeSnapshots(
   db: Db,
   initiativeId: string,
   opts: { teamIds?: string[]; now?: Date } = {}
): Promise<ProjectSnapshotPoint[]> {
   const ids = await initiativeDescendantIds(db, [initiativeId]);
   if (ids.length === 0) return [];
   const scope = opts.teamIds ? new Set(opts.teamIds) : null;
   const rows = await db
      .select({ id: projectT.id, teamId: projectT.teamId, initiativeId: projectT.initiativeId })
      .from(projectT)
      .where(inArray(projectT.initiativeId, ids));
   const projectIds = rows.filter((r) => scope === null || scope.has(r.teamId)).map((r) => r.id);
   return getAggregatedSnapshots(db, projectIds, opts.now);
}
