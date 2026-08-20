import LexoRank from '@kayron013/lexorank';

/** Ponto de partida do rank (mesmo do mock-data). */
const BASE = 'a3c';

export function firstRank(): string {
   return new LexoRank(BASE).toString();
}

/** Rank imediatamente após `rank` (append no fim). `from()` faz o parse do "bucket|value". */
export function rankAfter(rank: string): string {
   return LexoRank.from(rank).increment().toString();
}

/**
 * Rank entre dois vizinhos (drag-and-drop). `null` em qualquer ponta = extremidade.
 * Ambos null → base (lista vazia).
 */
export function rankBetween(before: string | null, after: string | null): string {
   if (before && after) return LexoRank.between(before, after).toString();
   if (before) return LexoRank.between(before, null).toString();
   if (after) return LexoRank.between(null, after).toString();
   return firstRank();
}
