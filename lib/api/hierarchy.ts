/**
 * Árvores pai/filho de times e initiatives (#100).
 *
 * Ambas as tabelas são pequenas (dezenas de linhas), então a travessia carrega
 * `(id, parent_id)` inteiro e resolve em memória — mais simples que CTE recursiva e
 * portável para o PGlite dos testes. A guarda de ciclo é app-level, igual à de
 * `issue.parent_id` (`lib/api/issues.ts`).
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { team as teamT, initiative as initT } from '@/db/schema';
import { ApiError } from './errors';

/** Teto de profundidade ao subir/descer a árvore (dados legados podem ter ciclo). */
export const MAX_TREE_DEPTH = 64;

type Edge = { id: string; parentId: string | null };

async function teamEdges(db: Db): Promise<Edge[]> {
   return db.select({ id: teamT.id, parentId: teamT.parentId }).from(teamT);
}

async function initiativeEdges(db: Db): Promise<Edge[]> {
   return db.select({ id: initT.id, parentId: initT.parentId }).from(initT);
}

/** `parentId -> filhos`, ignorando raízes. */
function childrenIndex(edges: Edge[]): Map<string, string[]> {
   const byParent = new Map<string, string[]>();
   for (const e of edges) {
      if (!e.parentId) continue;
      const arr = byParent.get(e.parentId);
      if (arr) arr.push(e.id);
      else byParent.set(e.parentId, [e.id]);
   }
   return byParent;
}

/** Descendentes de `roots` (as próprias raízes incluídas), sem repetição. */
function descendants(edges: Edge[], roots: readonly string[]): string[] {
   const byParent = childrenIndex(edges);
   const seen = new Set<string>();
   const queue = [...roots];
   // `seen` já corta ciclo; o teto é só uma rede contra dado corrompido.
   for (let steps = 0; queue.length > 0 && steps < edges.length + roots.length + 1; steps++) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(byParent.get(id) ?? []));
   }
   return [...seen];
}

/** Ancestrais de `id` (pai, avô, …), de baixo pra cima. */
function ancestors(edges: Edge[], id: string): string[] {
   const parentOf = new Map(edges.map((e) => [e.id, e.parentId]));
   const out: string[] = [];
   let cur = parentOf.get(id) ?? null;
   for (let depth = 0; cur && depth < MAX_TREE_DEPTH; depth++) {
      if (out.includes(cur)) break;
      out.push(cur);
      cur = parentOf.get(cur) ?? null;
   }
   return out;
}

/** Times `roots` + todos os seus sub-times (recursivo). */
export async function teamDescendantIds(db: Db, roots: readonly string[]): Promise<string[]> {
   if (roots.length === 0) return [];
   return descendants(await teamEdges(db), roots);
}

/** Cadeia de times acima de `teamId` (pai primeiro). */
export async function teamAncestorIds(db: Db, teamId: string): Promise<string[]> {
   return ancestors(await teamEdges(db), teamId);
}

/** Initiatives `roots` + todas as suas sub-initiatives (recursivo). */
export async function initiativeDescendantIds(db: Db, roots: readonly string[]): Promise<string[]> {
   if (roots.length === 0) return [];
   return descendants(await initiativeEdges(db), roots);
}

/** Cadeia de initiatives acima de `id` (pai primeiro). */
export async function initiativeAncestorIds(db: Db, id: string): Promise<string[]> {
   return ancestors(await initiativeEdges(db), id);
}

/** Filhos diretos de um time. */
export async function teamChildIds(db: Db, teamId: string): Promise<string[]> {
   const rows = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.parentId, teamId));
   return rows.map((r) => r.id);
}

function assertParent(
   edges: Edge[],
   id: string,
   parentId: string,
   kind: 'time' | 'initiative'
): void {
   if (id === parentId) throw new ApiError(400, `Um ${kind} não pode ser pai de si mesmo`);
   if (!edges.some((e) => e.id === parentId))
      throw new ApiError(400, `Pai '${parentId}' não existe`);
   // Ciclo: o novo pai não pode estar na subárvore do próprio nó.
   if (descendants(edges, [id]).includes(parentId))
      throw new ApiError(400, `Ciclo de ${kind}s: '${parentId}' está abaixo de '${id}'`);
}

/** Valida `team.parentId` (existe, não é o próprio, não fecha ciclo). */
export async function assertTeamParent(db: Db, id: string, parentId: string): Promise<void> {
   assertParent(await teamEdges(db), id, parentId, 'time');
}

/** Valida `initiative.parentId` (existe, não é a própria, não fecha ciclo). */
export async function assertInitiativeParent(db: Db, id: string, parentId: string): Promise<void> {
   assertParent(await initiativeEdges(db), id, parentId, 'initiative');
}

/**
 * Interseção de dois escopos de ids. `undefined` = sem restrição daquele lado, então
 * `intersectScopes(undefined, x) === x`. Resultado `[]` significa "nada visível".
 */
export function intersectScopes(
   a: readonly string[] | undefined,
   b: readonly string[] | undefined
): string[] | undefined {
   if (!a) return b ? [...b] : undefined;
   if (!b) return [...a];
   const set = new Set(b);
   return a.filter((id) => set.has(id));
}
