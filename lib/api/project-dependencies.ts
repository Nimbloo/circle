/**
 * Dependências entre projetos (#102) — "Depends on" no painel do projeto e as setas
 * do Roadmap.
 *
 * O grafo é pequeno (dezenas de arestas), então a guarda de ciclo carrega as arestas
 * inteiras e resolve em memória, como `lib/api/hierarchy.ts` faz com times e
 * initiatives. Ciclo → 400 (a UI não deve conseguir criar um).
 */
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { project as projectT, projectDependency } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';

type Edge = { projectId: string; dependsOnId: string };

/** `projectId -> ids de quem ele depende`. */
function adjacency(edges: Edge[]): Map<string, string[]> {
   const map = new Map<string, string[]>();
   for (const e of edges) {
      const arr = map.get(e.projectId);
      if (arr) arr.push(e.dependsOnId);
      else map.set(e.projectId, [e.dependsOnId]);
   }
   return map;
}

/** `true` se `to` é alcançável a partir de `from` seguindo as dependências. */
function reaches(edges: Edge[], from: string, to: string): boolean {
   const adj = adjacency(edges);
   const seen = new Set<string>();
   const queue = [from];
   // `seen` corta ciclo em dado legado; o teto é só uma rede extra.
   for (let steps = 0; queue.length > 0 && steps <= edges.length + 1; steps++) {
      const id = queue.shift()!;
      if (id === to && id !== from) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of adj.get(id) ?? []) {
         if (next === to) return true;
         queue.push(next);
      }
   }
   return false;
}

async function allEdges(db: Db): Promise<Edge[]> {
   return db
      .select({
         projectId: projectDependency.projectId,
         dependsOnId: projectDependency.dependsOnId,
      })
      .from(projectDependency);
}

/** Ids de quem `projectId` depende, em ordem alfabética de nome do projeto. */
export async function listDependencies(db: Db, projectId: string): Promise<string[]> {
   const rows = await db
      .select({ dependsOnId: projectDependency.dependsOnId })
      .from(projectDependency)
      .where(eq(projectDependency.projectId, projectId));
   if (rows.length === 0) return [];
   const names = await db
      .select({ id: projectT.id, name: projectT.name })
      .from(projectT)
      .where(
         inArray(
            projectT.id,
            rows.map((r) => r.dependsOnId)
         )
      );
   const nameById = new Map(names.map((r) => [r.id, r.name]));
   return rows
      .map((r) => r.dependsOnId)
      .sort((a, b) => (nameById.get(a) ?? '').localeCompare(nameById.get(b) ?? ''));
}

/** Todas as arestas do workspace (o Roadmap desenha as setas a partir delas). */
export async function listAllDependencies(db: Db): Promise<Edge[]> {
   return allEdges(db);
}

/**
 * Substitui o conjunto de dependências do projeto. Valida existência dos alvos,
 * auto-referência e ciclo (400 em qualquer caso). Devolve a lista final.
 */
export async function setDependencies(
   db: Db,
   projectId: string,
   dependsOn: readonly string[]
): Promise<string[]> {
   const exists = await db
      .select({ id: projectT.id })
      .from(projectT)
      .where(eq(projectT.id, projectId))
      .limit(1);
   if (exists.length === 0) throw new ApiError(404, `Project '${projectId}' não encontrado`);

   const targets = [...new Set(dependsOn)];
   if (targets.includes(projectId))
      throw new ApiError(400, 'Um projeto não pode depender de si mesmo');
   if (targets.length) {
      const found = await db
         .select({ id: projectT.id })
         .from(projectT)
         .where(inArray(projectT.id, targets));
      const known = new Set(found.map((r) => r.id));
      const unknown = targets.find((id) => !known.has(id));
      if (unknown) throw new ApiError(400, `Project '${unknown}' não existe`);
   }

   // Ciclo: o grafo resultante não pode ter caminho de volta de um alvo até este projeto.
   const others = (await allEdges(db)).filter((e) => e.projectId !== projectId);
   for (const target of targets) {
      if (target === projectId || reaches(others, target, projectId)) {
         throw new ApiError(400, `Ciclo de dependências: '${target}' já depende de '${projectId}'`);
      }
   }

   await db.transaction(async (tx) => {
      await tx.delete(projectDependency).where(eq(projectDependency.projectId, projectId));
      if (targets.length) {
         await tx
            .insert(projectDependency)
            .values(targets.map((dependsOnId) => ({ projectId, dependsOnId })))
            .onConflictDoNothing();
      }
   });
   publish({ entity: 'project', action: 'updated', id: projectId });
   return listDependencies(db, projectId);
}
