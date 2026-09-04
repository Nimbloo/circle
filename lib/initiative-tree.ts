/**
 * Hierarquia de sub-initiatives para a UI (#100). Módulo PURO (sem React), espelho
 * de `lib/team-tree.ts`.
 */
import type { Initiative } from '@/data/initiatives';

/** Teto de profundidade: dado corrompido (ciclo) não pode travar a renderização. */
const MAX_DEPTH = 32;

/** Caminho da raiz até a initiative ("Mãe › Filha"). */
export function initiativeBreadcrumb(initiatives: Initiative[], id: string): Initiative[] {
   const byId = new Map(initiatives.map((i) => [i.id, i]));
   const path: Initiative[] = [];
   let cur = byId.get(id);
   for (let depth = 0; cur && depth < MAX_DEPTH; depth++) {
      if (path.some((i) => i.id === cur!.id)) break; // ciclo em dado legado
      path.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
   }
   return path;
}

/** Ids de `id` e de todas as suas sub-initiatives (para excluir do picker de pai). */
export function initiativeWithDescendants(initiatives: Initiative[], id: string): string[] {
   const out = new Set<string>([id]);
   for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const before = out.size;
      for (const i of initiatives) if (i.parentId && out.has(i.parentId)) out.add(i.id);
      if (out.size === before) break;
   }
   return [...out];
}
