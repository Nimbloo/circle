import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __circlePool?: Pool; __circleDb?: Db; __circleTestDb?: Db };

/** Instância de produção (node-postgres). Pool lazy — conecta só na 1ª query. */
function prodDb(): Db {
   if (!g.__circleDb) {
      const pool =
         g.__circlePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
      if (process.env.NODE_ENV !== 'production') g.__circlePool = pool;
      g.__circleDb = drizzle(pool, { schema });
   }
   return g.__circleDb;
}

/** Fonte do db para route handlers/serviços. Em testes, um db PGlite injetado tem prioridade. */
export function getDb(): Db {
   return g.__circleTestDb ?? prodDb();
}

/** Apenas para testes: injeta um db (PGlite) para os route handlers usarem. */
export function __setTestDb(d: Db | null): void {
   g.__circleTestDb = d ?? undefined;
}

/**
 * `db` para os route handlers/serviços: Proxy que delega para {@link getDb} a cada
 * acesso, então o override de teste (PGlite) vale sem mudar os imports das rotas.
 * Pool de produção é lazy (só na 1ª query real).
 */
export const db: Db = new Proxy({} as Db, {
   get(_t, prop) {
      const real = getDb() as unknown as Record<string | symbol, unknown>;
      const val = real[prop];
      return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(real) : val;
   },
}) as Db;

export { schema };
