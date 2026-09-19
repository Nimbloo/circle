import LexoRank from '@kayron013/lexorank';
import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { issue } from '@/db/schema';

/** Ponto de partida do rank (mesmo do mock-data). */
const BASE = 'a3c';
export const RANK_MAX_LENGTH = 32;
export const ISSUE_RANK_LOCK_KEY = 4210773;

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

export function needsRankRebalance(rank: string): boolean {
   return rank.length > RANK_MAX_LENGTH;
}

type RankDb = Pick<Db, 'execute'>;

/** Reescreve todos os ranks do time em uma sequência LexoRank curta e ordenada. */
export async function rebalanceTeamRanks(db: Db, teamId: string): Promise<void> {
   await db.transaction(async (tx) => rebalanceTeamRanksInTransaction(tx, teamId));
}

export async function rebalanceTeamRanksInTransaction(tx: RankDb, teamId: string): Promise<void> {
   await tx.execute(sql`select pg_advisory_xact_lock(${ISSUE_RANK_LOCK_KEY})`);
   // Mesma fórmula da migration 0050: posições ímpares em hex, 8 dígitos, deixando um
   // vão entre vizinhos para os próximos inserts/reorders.
   await tx.execute(sql`
      UPDATE ${issue} AS i
      SET rank = '0|' || lpad(to_hex((o.position * 2 + 1)::bigint), 8, '0')
      FROM (
         SELECT id, row_number() OVER (ORDER BY rank, id) AS position
         FROM ${issue}
         WHERE team_id = ${teamId}
      ) AS o
      WHERE i.id = o.id
   `);
}
